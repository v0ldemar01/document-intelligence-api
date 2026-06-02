interface DocumentJobDispatcher {
  dispatch(jobId: string): Promise<void>;
}

export { type DocumentJobDispatcher };
