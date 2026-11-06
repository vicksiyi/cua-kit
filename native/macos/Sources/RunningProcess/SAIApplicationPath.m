#import "SAIApplicationPath.h"
#import <AppKit/AppKit.h>

NSString *SAIApplicationPathForName(NSString *name) {
    return [[NSWorkspace sharedWorkspace] fullPathForApplication:name];
}
