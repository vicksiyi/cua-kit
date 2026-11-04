import { registerKernelSandbox } from "./kernel_sandbox";
import { createKernelWorkerFactory } from "./kernel_worker_factory";
import { kernelWorkerSource } from "./kernel_worker_source";
registerKernelSandbox(window, createKernelWorkerFactory(kernelWorkerSource));
