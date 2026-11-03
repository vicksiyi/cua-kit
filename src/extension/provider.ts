import type { ClipboardBackend } from '../core/clipboard.js';
import { randomUUID } from 'node:crypto';
import { ExtensionBridge, type GrantedTab } from './bridge.js';
import { ExtensionDriver } from './driver.js';
import { CuaTab } from '../browser/tab.js';
import type { Authorize, AuditEvent, ActionOptions } from '../core/types.js';
import { assert, checkAbort } from '../core/errors.js';

export class ExtensionProvider {
  readonly sessionId = randomUUID();
  private active = true;
  private generation = 0;
  private targets = new Map<number, Promise<{ tab: CuaTab; driver: ExtensionDriver }>>();
  constructor(private bridge: ExtensionBridge, private options: { clipboard?: ClipboardBackend; authorize: Authorize; audit?: (event: AuditEvent) => void }) {}
  async listTabs(): Promise<GrantedTab[]> {
    assert(this.active, 'SESSION_CLOSED', 'Extension session ended.');
    const tabs = await this.bridge.listTabs(), visible: GrantedTab[] = [];
    for (const tab of tabs) if (await this.options.authorize({ sessionId:this.sessionId,targetId:`ext:${tab.id}`,url:tab.url,operation:'listTabs',effect:'read' })) visible.push(tab);
    return visible;
  }
  async getTab(reference: number | { url: string }, options: ActionOptions = {}): Promise<CuaTab> {
    const generation = this.generation; checkAbort(options.signal);
    const matches = (await this.listTabs()).filter(tab => typeof reference === 'number' ? tab.id === reference : tab.url === reference.url);
    assert(matches.length > 0, 'TARGET_NOT_FOUND', 'No granted extension tab matches.');
    assert(matches.length === 1, 'AMBIGUOUS_TARGET', 'Multiple granted tabs match; specify ID.');
    const info = matches[0]!;
    assert(await this.options.authorize({ sessionId:this.sessionId,targetId:`ext:${info.id}`,url:info.url,operation:'attach',effect:'write' }), 'PERMISSION_DENIED', 'Host denied debugger attachment.');
    assert(this.active && generation === this.generation, 'CANCELLED', 'Extension session reset during authorization.');
    checkAbort(options.signal);
    let target = this.targets.get(info.id);
    if (!target) {
      target = (async () => {
        const driver = await ExtensionDriver.create(this.bridge, info);
        try {
          assert(this.active && generation === this.generation, 'CANCELLED', 'Extension session reset while attaching.');
          const tab = await CuaTab.create(`ext:${info.id}`, driver, { sessionId:this.sessionId,authorize:this.options.authorize,audit:this.options.audit,active:() => this.active,clipboard:this.options.clipboard });
          return { tab, driver };
        } catch (error) { await driver.dispose(); throw error; }
      })();
      this.targets.set(info.id, target);
      const current = target; target.catch(() => { if (this.targets.get(info.id) === current) this.targets.delete(info.id); });
    }
    const { tab } = await target; checkAbort(options.signal); await tab.observe({disableDiffing:true,signal:options.signal}); return tab;
  }
  async reset(): Promise<void> {
    this.generation++;
    const targets = [...this.targets.values()]; this.targets.clear();
    await Promise.allSettled(targets.map(async pending => { const {tab,driver} = await pending; await tab.dispose(); await driver.dispose(); }));
  }
  async close(): Promise<void> { this.active = false; await this.reset(); }
}
