# Scene record framing

**Status:** high confidence.

Many dLive scene objects use a common frame:

```text
uint16_be payload_length
payload[payload_length]
```

For labelled objects, the payload normally begins with a NUL-terminated printable ASCII label followed by fixed-position state bytes.

This framing has been independently observed on:

- name/colour managers
- Surface bank switchers
- RackUltra `AHFX Manager NN` records
- input parametric EQ
- compressors
- gates and other processing structures discovered by label

The length prefix gives a hard boundary and prevents the parser from relying on the next printable string to infer record size.

## Caution

A stable label does not prove every historical scene stores an identical optional state payload. Current 2.12 scenes are treated as the main parameter-value baseline; factory/reset scenes are used carefully for structure discovery.
