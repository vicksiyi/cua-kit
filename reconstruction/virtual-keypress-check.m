#import <Foundation/Foundation.h>
#import <objc/runtime.h>
#import "SAIVirtualKeyPress.h"

int main(void) {
    @autoreleasepool {
        NSCAssert(class_getInstanceSize([SAIVirtualKeyPress class]) == 24, @"Instance layout differs");
        NSCAssert(ivar_getOffset(class_getInstanceVariable([SAIVirtualKeyPress class], "_keyCode")) == 8, @"keyCode offset differs");
        NSCAssert(ivar_getOffset(class_getInstanceVariable([SAIVirtualKeyPress class], "_modifiers")) == 12, @"modifiers offset differs");
        NSCAssert(ivar_getOffset(class_getInstanceVariable([SAIVirtualKeyPress class], "_string")) == 16, @"string offset differs");
        NSMutableString *text = [@"A" mutableCopy];
        SAIVirtualKeyPress *value = [[SAIVirtualKeyPress alloc] initWithKeyCode:12 modifiers:0x200 string:text];
        [text appendString:@"changed"];
        NSCAssert(value.keyCode == 12 && value.modifiers == 0x200 && [value.string isEqualToString:@"A"], @"Copy/value mismatch");
        NSCAssert([value.description isEqualToString:@"<SAIVirtualKeyPress: 12, 0200, A>"], @"Description mismatch");
        SAIVirtualKeyPress *same = [[SAIVirtualKeyPress alloc] initWithKeyCode:12 modifiers:0x200 string:@"A"];
        SAIVirtualKeyPress *different = [[SAIVirtualKeyPress alloc] initWithKeyCode:12 modifiers:0 string:@"A"];
        NSCAssert([value isEqual:value] && [value isEqual:same] && ![value isEqual:different] && ![value isEqual:@"A"] && ![value isEqual:nil], @"Equality mismatch");
        SAIVirtualKeyPress *empty = [[SAIVirtualKeyPress alloc] initWithKeyCode:0 modifiers:0 string:nil];
        NSCAssert([empty isEqual:[[SAIVirtualKeyPress alloc] initWithKeyCode:0 modifiers:0 string:nil]], @"Nullable string equality mismatch");
        NSArray<SAIVirtualKeyPress *> *translated = [SAIVirtualKeyPress keyPressesForString:@"aA\n"];
        NSCAssert(translated != nil && translated.count == 3, @"Current layout did not translate aA/newline");
        NSArray<NSString *> *expected = @[@"a", @"A", @"\r"];
        for (NSUInteger index = 0; index < translated.count; index++) {
            NSCAssert(translated[index].keyCode <= 127 && [translated[index].string isEqualToString:expected[index]], @"Translated string/key mismatch");
        }
        NSCAssert([SAIVirtualKeyPress keyPressesForString:@""].count == 0, @"Empty input mismatch");
        puts("Objective-C virtual keypress layout/copy/equality/description and current-layout translation checks passed; no input posting");
    }
    return 0;
}
