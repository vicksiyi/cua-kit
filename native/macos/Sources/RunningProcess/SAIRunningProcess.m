#import "SAIRunningProcess.h"
#import <libproc.h>
#import <unistd.h>

@implementation SAIRunningProcessFilter
- (instancetype)initWithName:(NSString *)name options:(NSUInteger)options {
    return [self initWithName:name executablePath:nil options:options];
}
- (instancetype)initWithName:(NSString *)name executablePath:(NSString *)path options:(NSUInteger)options {
    if ((self = [super init])) { _name = [name copy]; _executablePath = [path copy]; _options = options; }
    return self;
}
@end

@implementation SAIRunningProcess
// 0x1002452d8: any positive proc_pidinfo result follows the construction path.
- (instancetype)initWithProcessIdentifier:(pid_t)pid {
    struct proc_bsdinfo info;
    if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info)) <= 0) return nil;
    return [self initWithProcessName:[NSString stringWithUTF8String:info.pbi_name] bsdInfo:info];
}
- (instancetype)initWithProcessName:(NSString *)name bsdInfo:(struct proc_bsdinfo)info {
    if ((self = [super init])) { _name = [name copy]; _pid = info.pbi_pid; _uid = info.pbi_uid; }
    return self;
}
+ (NSString *)executablePathForProcessIdentifier:(pid_t)pid {
    char path[PROC_PIDPATHINFO_MAXSIZE];
    if (proc_pidpath(pid, path, sizeof(path)) <= 0) return nil;
    return [NSString stringWithUTF8String:path];
}
- (NSString *)executablePath { return [SAIRunningProcess executablePathForProcessIdentifier:self.pid]; }

// 0x10024503c: a two-call enumeration, no buffer-growth retry, sorting or dedup.
+ (NSArray<SAIRunningProcess *> *)runningProcessesWithFilter:(SAIRunningProcessFilter *)filter {
    BOOL currentUserOnly = (filter.options & 1) != 0;
    uint32_t type = currentUserOnly ? PROC_UID_ONLY : PROC_ALL_PIDS;
    uint32_t typeInfo = currentUserOnly ? getuid() : 0;
    int size = proc_listpids(type, typeInfo, NULL, 0);
    if (size <= 0) return nil;
    pid_t *pids = malloc((size_t)size);
    if (!pids) return nil;
    int bytes = proc_listpids(type, typeInfo, pids, size);
    if (bytes <= 0) { free(pids); return nil; }
    NSMutableArray<SAIRunningProcess *> *result = [NSMutableArray new];
    NSString *name = filter.name;
    NSString *path = [[filter.executablePath stringByResolvingSymlinksInPath] stringByStandardizingPath];
    for (NSUInteger index = 0; index < (NSUInteger)bytes / sizeof(pid_t); index++) {
        pid_t pid = pids[index];
        if (pid < 1) continue;
        SAIRunningProcess *process = nil;
        if (name) {
            process = [[SAIRunningProcess alloc] initWithProcessIdentifier:pid];
            if (![name isEqualToString:process.name]) continue;
        }
        if (path) {
            NSString *candidate = [self executablePathForProcessIdentifier:pid];
            if (!candidate) continue;
            candidate = [[candidate stringByResolvingSymlinksInPath] stringByStandardizingPath];
            if (![candidate isEqual:path]) continue;
        }
        if (!process) process = [[SAIRunningProcess alloc] initWithProcessIdentifier:pid];
        if (process) [result addObject:process];
    }
    free(pids);
    return result;
}
@end
