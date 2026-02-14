/*
 * PocketClaw root payload v7 — daemon stopper + kernel tuning.
 *
 * Runs in zygote domain (when init restarts zygote with COW'd app_process32).
 * Child: ctl.stop calls to kill daemons (may block, has alarm).
 * Parent: triggers kernel tuning via init service, then sleeps for restorer.
 *
 * Kernel tuning approach:
 * - /proc/sys/vm/* writes are BLOCKED by SELinux from zygote/system_server
 * - Solution: pre-COW init.qcom.post_boot.sh with sysctl script,
 *   then ctl.start qcom-post-boot to run it in init domain
 * - LMK params (/sys/module/lowmemorykiller/) are writable from zygote
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

/* Write a string to a /proc or /sys file. Returns 0 on success. */
static int sysctl_write(const char *path, const char *value) {
    int fd = open(path, O_WRONLY);
    if (fd < 0) return -1;
    int ret = write(fd, value, strlen(value));
    close(fd);
    return (ret > 0) ? 0 : -1;
}

int main(int argc, char *argv[]) {
    /* 1. Get root UID (works from zygote domain) */
    prctl(PR_SET_KEEPCAPS, 1, 0, 0, 0);
    setgid(0);
    setuid(0);

    /* 2. Transition to system_server for ctl.stop/ctl.start */
    try_setcon("u:r:system_server:s0");

    /* 3. Fork: child does ctl.stop (may block), parent does tuning */
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

    /* 4. Parent: kernel tuning */

    /* 4a. Trigger sysctl script via init service.
     * stop-daemons.sh pre-COWs init.qcom.post_boot.sh with sysctl lines.
     * ctl.start runs it in init domain which CAN write /proc/sys/vm/. */
    __system_property_set("ctl.start", "qcom-post-boot");

    /* 4b. LMK tuning — writable from zygote context.
     * More aggressive thresholds: kill cached/empty apps sooner.
     * Values in pages (4KB each): last 2 thresholds raised.
     * Default: 11264,13312,15360,17408,36864,43008
     * Tuned:  11264,13312,15360,17408,51200,61440
     * = kill empty procs when free < 240 MB (was 168)
     * = kill cached procs when free < 200 MB (was 144) */
    sysctl_write("/sys/module/lowmemorykiller/parameters/minfree",
                 "11264,13312,15360,17408,51200,61440");

    /* 5. Sleep 30s for external restorer to COW back original,
     *    then exit so init restarts zygote with clean binary. */
    sleep(30);
    _exit(0);
    return 0;
}
