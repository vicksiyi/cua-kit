#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// Original Objective-C metadata: keyCode@8 UInt16, modifiers@12 UInt32,
// strong NSString@16; instance size24 on the pinned arm64 binary.
@interface SAIVirtualKeyPress : NSObject {
@private
    UInt16 _keyCode;
    UInt32 _modifiers;
    NSString * _Nullable _string;
}
@property(nonatomic, readonly) UInt16 keyCode;
@property(nonatomic, readonly) UInt32 modifiers;
@property(nonatomic, readonly, copy, nullable) NSString *string;
- (instancetype)initWithKeyCode:(UInt16)keyCode modifiers:(UInt32)modifiers string:(nullable NSString *)string;
+ (nullable NSArray<SAIVirtualKeyPress *> *)keyPressesForString:(nullable NSString *)string;
@end

NS_ASSUME_NONNULL_END
