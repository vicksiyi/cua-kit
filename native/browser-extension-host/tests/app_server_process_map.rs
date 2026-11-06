use core_browser_extension_host::app_server_process_map::{client_id, select_process, ProcessMap};
use std::{
    collections::HashMap,
    sync::{Arc, Barrier, Mutex},
};
#[test]
fn exact_client_keys_and_concurrent_selection_reuse_one_state() {
    assert_eq!(client_id("/"), "default");
    assert_eq!(client_id("/?clientId=&clientId=second"), "default");
    assert_eq!(client_id("/?clientId=%20+"), "%20+");
    let map: ProcessMap = Arc::new(Mutex::new(HashMap::new()));
    let barrier = Arc::new(Barrier::new(12));
    let threads: Vec<_> = (0..12)
        .map(|_| {
            let map = map.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                select_process(&map, "/?clientId=shared").unwrap()
            })
        })
        .collect();
    let selected: Vec<_> = threads.into_iter().map(|t| t.join().unwrap()).collect();
    for state in &selected {
        assert!(Arc::ptr_eq(state, &selected[0]));
        assert!(state.lock().unwrap().child.is_none());
    }
    let other = select_process(&map, "/?clientId=Shared").unwrap();
    assert!(!Arc::ptr_eq(&other, &selected[0]));
    let fallback = select_process(&map, "/").unwrap();
    assert!(Arc::ptr_eq(
        &fallback,
        &select_process(&map, "/?clientId=default").unwrap()
    ));
    assert_eq!(map.lock().unwrap().len(), 3);
}
