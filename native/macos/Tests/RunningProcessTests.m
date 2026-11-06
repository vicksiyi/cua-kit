#import "SAIRunningProcess.h"
#import <unistd.h>
#import <assert.h>

int main(void) {
    @autoreleasepool {
        NSMutableString *name = [NSMutableString stringWithString:@"original"];
        NSMutableString *path = [NSMutableString stringWithString:@"/tmp/original"];
        SAIRunningProcessFilter *copy = [[SAIRunningProcessFilter alloc] initWithName:name executablePath:path options:5];
        [name appendString:@"-changed"]; [path appendString:@"-changed"];
        assert([copy.name isEqualToString:@"original"] && [copy.executablePath isEqualToString:@"/tmp/original"] && copy.options == 5);
        copy.name = name; [name appendString:@"-again"];
        assert([copy.name isEqualToString:@"original-changed"]);
        SAIRunningProcessFilter *shortForm = [[SAIRunningProcessFilter alloc] initWithName:nil options:1];
        assert(shortForm.name == nil && shortForm.executablePath == nil && shortForm.options == 1);
        struct proc_bsdinfo info = {0}; info.pbi_pid = 456; info.pbi_uid = 789;
        SAIRunningProcess *constructed = [[SAIRunningProcess alloc] initWithProcessName:name bsdInfo:info];
        [name appendString:@"-later"];
        assert(constructed.pid == 456 && constructed.uid == 789 && [constructed.name isEqualToString:@"original-changed-again"]);
        SAIRunningProcess *current = [[SAIRunningProcess alloc] initWithProcessIdentifier:getpid()];
        assert(current && current.pid == getpid() && current.uid == getuid());
        assert(current.name.length > 0 && current.executablePath.length > 0);
        assert([[SAIRunningProcess alloc] initWithProcessIdentifier:-1] == nil);
        assert([SAIRunningProcess executablePathForProcessIdentifier:-1] == nil);
        NSString *link = [NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString];
        assert([NSFileManager.defaultManager createSymbolicLinkAtPath:link withDestinationPath:current.executablePath error:nil]);
        @try {
            for (NSNumber *options in @[@0, @1, @5]) {
                SAIRunningProcessFilter *filter = [[SAIRunningProcessFilter alloc] initWithName:current.name executablePath:link options:options.unsignedIntegerValue];
                NSArray<SAIRunningProcess *> *found = [SAIRunningProcess runningProcessesWithFilter:filter];
                assert(found != nil);
                BOOL foundSelf = NO;
                for (SAIRunningProcess *item in found) {
                    if (item.pid == getpid()) foundSelf = YES;
                    assert([item.name isEqualToString:current.name]);
                    if (options.unsignedIntegerValue & 1) assert(item.uid == getuid());
                }
                assert(foundSelf);
            }
            SAIRunningProcessFilter *miss = [[SAIRunningProcessFilter alloc] initWithName:NSUUID.UUID.UUIDString options:1];
            NSArray *empty = [SAIRunningProcess runningProcessesWithFilter:miss];
            assert(empty != nil && empty.count == 0);
        } @finally { [NSFileManager.defaultManager removeItemAtPath:link error:nil]; }
        puts("Objective-C running process query validates copy, PID, UID, name and symlink filtering");
    }
    return 0;
}
