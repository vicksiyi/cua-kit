#import "SAIVirtualKeyPress.h"
#import <Carbon/Carbon.h>

@implementation SAIVirtualKeyPress
@synthesize keyCode = _keyCode, modifiers = _modifiers, string = _string;

- (instancetype)initWithKeyCode:(UInt16)keyCode modifiers:(UInt32)modifiers string:(NSString *)string {
    if ((self = [super init])) {
        _keyCode = keyCode;
        _modifiers = modifiers;
        _string = [string copy];
    }
    return self;
}

- (BOOL)isEqual:(id)object {
    if (object == self) return YES;
    if (![object isKindOfClass:[SAIVirtualKeyPress class]]) return NO;
    SAIVirtualKeyPress *other = object;
    return self.keyCode == other.keyCode && self.modifiers == other.modifiers &&
        ((!self.string && !other.string) || [self.string isEqualToString:other.string]);
}

- (NSString *)description {
    return [NSString stringWithFormat:@"<SAIVirtualKeyPress: %d, %04x, %@>",
        self.keyCode, self.modifiers, self.string];
}

+ (NSArray<SAIVirtualKeyPress *> *)keyPressesForString:(NSString *)string {
    NSMutableArray<SAIVirtualKeyPress *> *result = [NSMutableArray new];
    TISInputSourceRef inputSource = TISCopyCurrentKeyboardLayoutInputSource();
    if (!inputSource) { NSLog(@"Unable to get current keyboard layout."); return nil; }
    CFDataRef data = TISGetInputSourceProperty(inputSource, kTISPropertyUnicodeKeyLayoutData);
    if (!data) { NSLog(@"Unable to get keyboard layout data."); CFRelease(inputSource); return nil; }
    const UCKeyboardLayout *layout = (const UCKeyboardLayout *)CFDataGetBytePtr(data);
    if (!layout) { NSLog(@"Unable to get keyboard layout pointer."); CFRelease(inputSource); return nil; }
    UInt32 keyboardType = LMGetKbdType();
    // Pinned0x10116b358, priority order is significant.
    const UInt32 modifiers[] = {0, 0x200, 0x800, 0xa00, 0x1000, 0x1200, 0x1800, 0x1a00};
    for (NSUInteger index = 0; index < string.length; index++) {
        UniChar character = [string characterAtIndex:index];
        if (character == '\n') character = '\r';
        BOOL matched = NO;
        for (NSUInteger modifierIndex = 0; modifierIndex < 8 && !matched; modifierIndex++) {
            for (UInt16 keyCode = 0; keyCode <= 0x7f; keyCode++) {
                UInt32 deadKeyState = 0;
                UniCharCount length = 0;
                UniChar characters[4];
                OSStatus status = UCKeyTranslate(layout, keyCode, kUCKeyActionDisplay,
                    (modifiers[modifierIndex] >> 8) & 0xff, keyboardType, 0,
                    &deadKeyState, 4, &length, characters);
                if (status == noErr && length != 0 && characters[0] == character) {
                    NSString *translated = [NSString stringWithCharacters:characters length:length];
                    [result addObject:[[SAIVirtualKeyPress alloc] initWithKeyCode:keyCode
                        modifiers:modifiers[modifierIndex] string:translated]];
                    matched = YES;
                    break;
                }
            }
        }
        if (!matched) NSLog(@"Could not find key code for character: %C", character);
    }
    CFRelease(inputSource);
    return result;
}
@end
