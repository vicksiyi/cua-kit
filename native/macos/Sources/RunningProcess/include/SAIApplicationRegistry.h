#import <Carbon/Carbon.h>

// Typed C boundary for the legacy system entry point still used by native CUA.
// Swift SDK availability of GetProcessPID does not hide this wrapper.
int32_t CoreCUAGetProcessPID(ProcessSerialNumber *process, int32_t *pid);

int32_t CoreCUAGetProcessForPID(int32_t pid, ProcessSerialNumber *process);
