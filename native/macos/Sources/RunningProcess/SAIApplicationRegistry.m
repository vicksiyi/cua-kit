#import "SAIApplicationRegistry.h"

int32_t CoreCUAGetProcessPID(ProcessSerialNumber *process, int32_t *pid) {
    return GetProcessPID(process, pid);
}

int32_t CoreCUAGetProcessForPID(int32_t pid, ProcessSerialNumber *process) {
    return GetProcessForPID(pid, process);
}
