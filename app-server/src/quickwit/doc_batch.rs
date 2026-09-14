// Portions of this module are adapted from Quickwit's Apache-2.0 licensed
// implementation in https://github.com/quickwit-oss/quickwit/blob/main/quickwit/quickwit-ingest/src/doc_batch.rs

use bytes::{Buf, BufMut, Bytes, BytesMut};
use serde::Serialize;

use super::proto::ingest_service::DocBatch;

#[derive(Debug)]
enum DocCommand<T>
where
    T: Buf,
{
    Ingest { payload: T },
    Commit,
}

#[repr(u8)]
#[derive(Copy, Clone)]
enum DocCommandCode {
    IngestV1 = 0,
    CommitV1 = 1,
}

impl<T> DocCommand<T>
where
    T: Buf,
{
    fn write(self, mut buf: impl BufMut) -> usize {
        match self {
            DocCommand::Ingest { mut payload } => {
                buf.put_u8(DocCommandCode::IngestV1 as u8);
                let mut written = 1;
                while payload.has_remaining() {
                    let chunk = payload.chunk();
                    buf.put_slice(chunk);
                    let len = chunk.len();
                    payload.advance(len);
                    written += len;
                }
                written
            }
            DocCommand::Commit => {
                buf.put_u8(DocCommandCode::CommitV1 as u8);
                1
            }
        }
    }
}

struct DocBatchBuilder {
    index_id: String,
    doc_buffer: BytesMut,
    doc_lengths: Vec<u32>,
}

impl DocBatchBuilder {
    fn new<S: Into<String>>(index_id: S) -> Self {
        Self {
            index_id: index_id.into(),
            doc_buffer: BytesMut::new(),
            doc_lengths: Vec::new(),
        }
    }

    fn ingest_doc(&mut self, payload: Bytes) {
        let len = DocCommand::Ingest { payload }.write(&mut self.doc_buffer);
        self.doc_lengths.push(len as u32);
    }

    fn commit(&mut self) {
        let len = DocCommand::Commit::<Bytes>.write(&mut self.doc_buffer);
        self.doc_lengths.push(len as u32);
    }

    fn build(self) -> DocBatch {
        DocBatch {
            index_id: self.index_id,
            doc_buffer: self.doc_buffer.freeze().to_vec(),
            doc_lengths: self.doc_lengths,
        }
    }
}

pub fn build_json_doc_batch<T: Serialize>(
    index_id: &str,
    docs: &[T],
) -> serde_json::Result<DocBatch> {
    let mut builder = DocBatchBuilder::new(index_id);

    for doc in docs {
        let payload = serde_json::to_vec(doc)?;
        builder.ingest_doc(Bytes::from(payload));
    }

    builder.commit();

    Ok(builder.build())
}
