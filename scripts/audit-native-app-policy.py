"""Read pinned Swift policy metadata; never execute the vendor service."""
import hashlib
import json
from pathlib import Path
import struct

SOURCE = Path('/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService')
EXPECTED = 'b64e219f30c655407e485d5fab47d354ea6398842fc49a6bad917810df54c862'


def audit():
    data = SOURCE.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != EXPECTED:
        raise ValueError('Binary changed; re-locate metadata before applying these addresses')
    segments = []
    offset = 32
    for _ in range(struct.unpack_from('<I', data, 16)[0]):
        command, size = struct.unpack_from('<II', data, offset)
        if command == 0x19:
            _, address, _, file_offset, file_size = struct.unpack_from('<16sQQQQ', data, offset + 8)
            segments.append((address, address + file_size, file_offset))
        offset += size

    def read(address, size):
        for low, high, file_offset in segments:
            if low <= address and address + size <= high:
                start = file_offset + address - low
                return data[start:start + size]
        raise ValueError(hex(address))

    def relative(address):
        value = struct.unpack('<i', read(address, 4))[0]
        return address + value if value else None

    def string(address):
        result = bytearray()
        while len(result) < 1024:
            byte = read(address + len(result), 1)
            if byte == b'\0':
                return result.decode('utf-8')
            result.extend(byte)
        raise ValueError('Unterminated metadata string')

    definitions = [
        (0x1012be3b4, 'CodexAppServerComputerUsePolicyProvider',
         ['$defaultActor', 'ttl', 'timeout', 'cachedPolicy', 'cachedAt']),
        (0x1012be434, 'ComputerUsePolicy',
         ['allowComputerUse', 'allowPersistentApproval', 'macos', 'configuredMacOS']),
        (0x1012be450, 'AppAccess', ['allow', 'deny']),
        (0x1012be46c, 'MacOS', ['defaultAppAccess', 'bundleIDs']),
    ]
    records = []
    for descriptor, expected_name, expected_fields in definitions:
        name = string(relative(descriptor + 8))
        fields = relative(descriptor + 16)
        kind, record_size, count = struct.unpack('<HHI', read(fields + 8, 8))
        if record_size != 12:
            raise ValueError('Unexpected Swift field record size')
        names = [string(relative(fields + 16 + i * record_size + 8)) for i in range(count)]
        if name != expected_name or names != expected_fields:
            raise ValueError(f'Metadata mismatch: {name}: {names}')
        records.append(dict(name=name, descriptor=hex(descriptor),
                            fieldDescriptor=hex(fields), kind=kind, fields=names,
                            fieldMetadataSha256=hashlib.sha256(read(fields, 16 + count * record_size)).hexdigest()))
    code_ranges = []
    for name, start, end in [
        ('providerCacheAndRefresh', 0x1000a7cbc, 0x1000a81f0),
        ('appServerPolicyFetch', 0x1000aa444, 0x1000aab28),
        ('optionalDictionaryParser', 0x1000a90f4, 0x1000a924c),
        ('strictBooleanParser', 0x1000a924c, 0x1000a93d4),
        ('macOSRulesParser', 0x1000a93d4, 0x1000a98f0),
        ('policyResponseParser', 0x1000a98f0, 0x1000aa444),
        ('appAccessEvaluation', 0x1000a7860, 0x1000a79e0),
        ('appDecisionBranch', 0x100191c60, 0x100191c98),
        ('forbiddenClassifier', 0x1002570c0, 0x1002572d4),
        ('forbiddenStringEquality', 0x100194fc8, 0x10019501c),
        ('applicationResolution', 0x10026222c, 0x1002624b8),
        ('applicationPathProbe', 0x1002624b8, 0x1002626a8),
        ('applicationResolutionPreferringRunning', 0x100262c10, 0x100262e34),
        ('applicationNameObjCBridge', 0x100244ac8, 0x100244b34),
        ('applicationTargetInitialization', 0x100261e30, 0x100261f10),
        ('applicationTargetIdentifier', 0x100264a14, 0x100264b8c),
        ('appPolicyResultComposition', 0x100191c2c, 0x100192130),
        ('riskAndApprovalResultConstruction', 0x100191eec, 0x100192130),
        ('bundleHTTPSchemePredicate', 0x1002561f0, 0x10025644c),
    ]:
        code_ranges.append(dict(name=name, start=hex(start), endExclusive=hex(end),
                                sha256=hashlib.sha256(read(start, end-start)).hexdigest()))
    def decode_string_array(label, address, expected_count):
        count = struct.unpack('<Q', read(address + 16, 8))[0]
        if count != expected_count:
            raise ValueError('Unexpected static string array count')
        values = []
        for index in range(count):
            raw = read(address + 32 + 16 * index, 16)
            first, second = struct.unpack('<QQ', raw)
            if raw[15] & 0x20:
                value = raw[:raw[15] & 15].decode('utf-8')
            else:
                # Pinned arm64 chained rebase + Swift immortal string bias.
                value = read(0x100000000 + (second & 0xffffffff) + 32, first & 0xffff).decode('utf-8')
            values.append(value)
        return dict(label=label, address=hex(address), values=values)
    forbidden_groups = [decode_string_array(*entry) for entry in [
        ('terminals', 0x1015588a0, 11), ('codex', 0x101558978, 5),
        ('chatGPT', 0x1015589f0, 5), ('systemAuthentication', 0x101558c70, 3),
    ]]
    return dict(binarySha256=digest, method='Static Mach-O Swift metadata and pinned disassembly analysis',
                types=records, codeRanges=code_ranges,
                normalForbiddenTargetGroups=forbidden_groups,
                elevatedRiskTargets=decode_string_array('elevatedRisk', 0x1015587c8, 11),
                targetDescriptor=dict(
                    bundleURL='resolvingSymlinksInPath then standardizedFileURL',
                    identifier='normalize URL again, path(percentEncoded: false), trim trailing slashes while count > 1',
                    displayName='first String of CFBundleDisplayName, CFBundleName, otherwise URL deletingPathExtension().lastPathComponent; empty String accepted',
                    order='policy decision, Bundle(url:), display name, risk and persistence metadata',
                    ipcProjection='standalone dictionary matching observed Sky client types, not original encoder reconstruction'),
                approvalMetadata=dict(
                    highRisk='terminal exact match OR elevated-risk exact match OR Bundle.supportsHTTPScheme',
                    bundleProbe='lazy after list misses; missing bundle means false',
                    httpScheme='CFBundleURLTypes as [[String: Any]], CFBundleURLSchemes as [String], exact http membership',
                    warningSubtitle='present only for high risk',
                    allowPersistentApproval='copied from parsed policy unchanged, including high-risk targets'),
                recoveredParser=dict(
                    requiredEnvelope=['requirementsResponse.requirements (null accepted)', 'configResponse.config (dictionary required)'],
                    optionalDictionary='missing/null becomes empty; other non-dictionaries throw',
                    optionalBoolean='missing/null becomes true; require CFBoolean identity and Bool cast otherwise',
                    allowComputerUseConjunction=['requirements.allowBrowserAndComputerUse',
                        'requirements.featureRequirements.computer_use', 'config.features.computer_use'],
                    persistentApproval='requirements.computerUse.allowPersistentApproval',
                    macOS=['requirements.computerUse.defaultAppAccess', 'requirements.computerUse.macos.bundleIds'],
                    configuredMacOS=['config.computer_use.default_app_access', 'config.computer_use.macos.bundle_ids'],
                    defaultAccess='missing/null becomes allow; otherwise exact allow or deny string',
                    bundleEntries='dictionary of exact allow/deny strings; null entry invalid',
                    evaluation='global enabled AND requirements layer allows AND configured layer allows; exact dictionary lookup before each layer default',
                    decision='denied when policy disallows; otherwise forbidden classifier decides forbidden versus allowed'),
                recoveredProvider=dict(cacheTTLSeconds=900, requestTimeoutSeconds=30,
                    cacheTimestamp='Date captured before refresh',
                    cacheHit='cached policy and timestamp exist; now.timeIntervalSince(cachedAt) < 900',
                    refreshFailure='propagate error; do not return stale policy or overwrite cache',
                    transport='CodexAppServerJSONRPCConnection(timeout: 30, disablePlugins: false)',
                    requestOrder=['initialize', 'configRequirements/read', 'config/read'],
                    configReadParams={'includeLayers': False},
                    closesConnectionOn='success, request failure, and policy parsing failure'),
                limitations=[
                    'Field names and enum cases establish structure, not runtime defaults or precedence.',
                    'Normal forbidden-target classification is restored; the original process preference override is not read, modified, or exposed by this component.',
                    'Native transport, application resolution and production integration remain incomplete; approval persistence storage is not implemented by these metadata helpers.',
                    'No claim that the standalone CORE_CUA_APP_POLICY default reproduces vendor policy.',
                    'No vendor execution, network requests, policy changes, or approval bypass.'])


if __name__ == '__main__':
    output = Path(__file__).resolve().parents[1] / 'reconstruction/native-app-policy-evidence.json'
    output.write_text(json.dumps(audit(), indent=2) + '\n')
    print(output)
