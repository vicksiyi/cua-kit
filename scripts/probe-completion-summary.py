#!/usr/bin/env python3
"""Read-only installed MCP protocol audit. Isolated homes; network denied;
no browser/app calls, credentials, or user JavaScript are executed. Mixed
code+summary input deliberately tests pre-dispatch argument rejection.
Write stdout to reconstruction/node-repl-completion-protocol.json to refresh.
"""
import subprocess,tempfile,os,json,select,hashlib,shutil
binary='/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl'
records=[]
for enabled in (False,True):
 home=tempfile.mkdtemp(prefix='cua-summary-audit-')
 env={'HOME':home,'CODEX_HOME':home,'TMPDIR':home,'PATH':'/usr/bin:/bin','NODE_REPL_DISABLE_ANALYTICS':'1','NODE_REPL_NODE_PATH':os.path.join(os.path.dirname(binary),'node')}
 if enabled:env['NODE_REPL_JS_COMPLETION_SUMMARY']=json.dumps({'instructions':'Report the completed task.','description':'Short completed task headline.'})
 p=subprocess.Popen(['/usr/bin/sandbox-exec','-p','(version 1)(allow default)(deny network*)',binary],cwd=home,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
 def send(m):p.stdin.write((json.dumps({'jsonrpc':'2.0',**m})+'\n').encode());p.stdin.flush()
 def req(i,method,params):
  send({'id':i,'method':method,'params':params})
  while True:
   if not select.select([p.stdout],[],[],10)[0]:raise TimeoutError(method)
   line=p.stdout.readline()
   if not line:raise Exception('exit '+str(p.poll()))
   m=json.loads(line)
   if m.get('id')==i:return m
 try:
  init=req(1,'initialize',{'protocolVersion':'2024-11-05','capabilities':{},'clientInfo':{'name':'isolated-protocol-audit','version':'0'}})
  send({'method':'notifications/initialized'})
  listed=req(2,'tools/list',{})
  cases=[]
  for i,args in enumerate([{'completion_summary':'Reviewed fixture page'},{'completion_summary':'Reviewed fixture page'},{'completion_summary':'😀'*80},{'completion_summary':'😀'*81},{'completion_summary':' '*2},{'completion_summary':''},{'completion_summary':None},{'completion_summary':'Done','code':'nodeRepl.write(42)'},{'completion_summary':'Done','title':'Title'},{'completion_summary':'Done','timeout_ms':100},{}],3):
   cases.append({'arguments':args,'response':req(i,'tools/call',{'name':'js','arguments':args})})
  records.append({'enabled':enabled,'initialize':init,'tools':listed,'cases':cases})
 finally:
  p.stdin.close()
  try:p.wait(timeout=3)
  except subprocess.TimeoutExpired:p.kill();p.wait()
  shutil.rmtree(home)
print(json.dumps({'binarySha256':hashlib.sha256(open(binary,'rb').read()).hexdigest(),'conditions':{'network':'denied by sandbox-exec','home':'temporary isolated HOME and CODEX_HOME','actions':'initialize, tools/list and summary argument validation only'},'records':records},indent=2))
