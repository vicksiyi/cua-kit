#import "SAIApplicationRegistry.h"

int32_t CoreCUAGetProcessPID(ProcessSerialNumber *process, int32_t *pid) {
    return GetProcessPID(process, pid);
}
