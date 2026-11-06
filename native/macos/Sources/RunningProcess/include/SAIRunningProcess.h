#import <Foundation/Foundation.h>
#import "SAIApplicationPath.h"
#import <sys/proc_info.h>
NS_ASSUME_NONNULL_BEGIN
@interface SAIRunningProcessFilter : NSObject
@property(nonatomic, copy, nullable) NSString *name;
@property(nonatomic, copy, nullable) NSString *executablePath;
@property(nonatomic) NSUInteger options;
- (instancetype)initWithName:(nullable NSString *)name options:(NSUInteger)options;
- (instancetype)initWithName:(nullable NSString *)name executablePath:(nullable NSString *)path options:(NSUInteger)options;
@end
@interface SAIRunningProcess : NSObject
@property(nonatomic, readonly) pid_t pid;
@property(nonatomic, readonly) uid_t uid;
@property(nonatomic, copy, readonly, nullable) NSString *name;
@property(nonatomic, readonly, nullable) NSString *executablePath;
- (nullable instancetype)initWithProcessIdentifier:(pid_t)pid;
- (instancetype)initWithProcessName:(nullable NSString *)name bsdInfo:(struct proc_bsdinfo)info;
+ (nullable NSString *)executablePathForProcessIdentifier:(pid_t)pid;
+ (nullable NSArray<SAIRunningProcess *> *)runningProcessesWithFilter:(nullable SAIRunningProcessFilter *)filter;
@end
NS_ASSUME_NONNULL_END
