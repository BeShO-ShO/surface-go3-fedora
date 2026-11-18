// SPDX-License-Identifier: GPL-2.0-only
// By NNBR1, posted in https://github.com/linux-surface/linux-surface/issues/2382 (2026-11-18).
// Masks the touchpad's mode-setting feature usages in the 614-byte report
// descriptor of the Surface Go 3 Type Cover (045e:09b5, interface 3), so
// hid-multitouch stops sending SET_REPORT(Feature) 7/8/16 on open/close/suspend.
// Those stall ep0 on the cover firmware: touchpad goes silent, Caps Lock LED
// updates time out, suspend waits 10 s (-EIO).
#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>

struct hid_bpf_probe_args {
    unsigned int hid;
    unsigned int rdesc_size;
    unsigned char rdesc[4096];
    int retval;
};

extern __u8 *hid_bpf_get_data(struct hid_bpf_ctx *ctx,
                              unsigned int offset,
                              const size_t sz) __ksym;

#define HID_BPF_CONFIG(...)                               \
    const union {                                         \
        __VA_ARGS__;                                      \
    } _device_ids SEC(".hid_bpf_config")

#define HID_DEVICE(b, g, v, p)                            \
    struct {                                              \
        const int (*name)[0];                             \
        const int (*bus)[(b)];                            \
        const int (*group)[(g)];                          \
        const int (*vid)[(v)];                            \
        const int (*pid)[(p)];                            \
    }

HID_BPF_CONFIG(
    HID_DEVICE(0x0003, 0x0004, 0x045E, 0x09B5) _entry0;
);

SEC("struct_ops/hid_rdesc_fixup")
int BPF_PROG(surface_go3_tp_fix_rdesc, struct hid_bpf_ctx *hctx)
{
    __u8 *data;

    if (hctx->size != 614)
        return 0;

    data = hid_bpf_get_data(hctx, 0, 614);
    if (!data)
        return 0;

    /* Report ID 7: Latency Mode (0x60) -> Undefined (0x00) */
    if (data[527] == 0x85 && data[528] == 0x07 && data[529] == 0x09 && data[530] == 0x60)
        data[530] = 0x00;

    /* Report ID 8: Input Mode (0x52) -> Undefined (0x00) */
    if (data[571] == 0x85 && data[572] == 0x08 && data[577] == 0x09 && data[578] == 0x52)
        data[578] = 0x00;

    /* Report ID 16: Surface Switch (0x57) & Button Switch (0x58) -> Undefined (0x00) */
    if (data[594] == 0x85 && data[595] == 0x10 &&
        data[596] == 0x09 && data[597] == 0x57 &&
        data[598] == 0x09 && data[599] == 0x58) {
        data[597] = 0x00;
        data[599] = 0x00;
    }

    return 0;
}

SEC(".struct_ops.link")
struct hid_bpf_ops surface_go3_typecover_tp = {
    .hid_rdesc_fixup = (void *)surface_go3_tp_fix_rdesc,
};

SEC("syscall")
int probe(struct hid_bpf_probe_args *ctx)
{
    if (ctx->rdesc_size != 614) {
        ctx->retval = -22;
        return 0;
    }
    if (ctx->rdesc[530] != 0x60 ||
        ctx->rdesc[578] != 0x52 ||
        ctx->rdesc[597] != 0x57 ||
        ctx->rdesc[599] != 0x58) {
        ctx->retval = -22;
        return 0;
    }
    ctx->retval = 0;
    return 0;
}

char _license[] SEC("license") = "GPL";
