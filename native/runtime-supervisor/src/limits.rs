//! Independent bounded deployment limits, not recovered vendor constants.
//! The observed native audio contract permits 300 s of 24 kHz stereo PCM16:
//! 28,800,000 bytes plus WAV headers, or about 38.4 MB in a base64 RPC frame.
pub const MAX_AUDIO_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_AUDIO_URL_BYTES: usize = 44 * 1024 * 1024;
pub const MAX_WORKER_FRAME_BYTES: usize = 48 * 1024 * 1024;
pub const MAX_WORKER_QUEUED_BYTES: usize = 96 * 1024 * 1024;
pub const MAX_EXECUTION_CONTENT_BYTES: usize = 48 * 1024 * 1024;
