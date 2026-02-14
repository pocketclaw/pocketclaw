/*
 * Test payload: try sysctl writes from multiple SELinux contexts.
 * Writes results to /data/local/tmp/sysctl-results.txt
 */
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <sys/prctl.h>

static int logfd = -1;

static void logmsg(const char *msg) {
    if (logfd >= 0) write(logfd, msg, strlen(msg));
}

static int try_setcon(const char *ctx) {
    int fd = open("/proc/self/attr/current", O_WRONLY);
    if (fd < 0) return -1;
    int ret = write(fd, ctx, strlen(ctx));
    close(fd);
    return (ret > 0) ? 0 : -1;
}

static void get_context(char *buf, int len) {
    int fd = open("/proc/self/attr/current", O_RDONLY);
    if (fd < 0) { snprintf(buf, len, "(unknown)"); return; }
    int n = read(fd, buf, len - 1);
    close(fd);
    if (n > 0) buf[n] = '\0'; else snprintf(buf, len, "(empty)");
}

static int try_write(const char *path, const char *value) {
    int fd = open(path, O_WRONLY);
    if (fd < 0) return errno;
    int ret = write(fd, value, strlen(value));
    int err = errno;
    close(fd);
    return (ret > 0) ? 0 : err;
}

static void try_sysctl(const char *label) {
    char line[256];
    int rc;

    snprintf(line, sizeof(line), "\n=== Context: %s ===\n", label);
    logmsg(line);

    rc = try_write("/proc/sys/vm/vfs_cache_pressure", "500");
    snprintf(line, sizeof(line), "vfs_cache_pressure=500: %s (errno=%d)\n",
             rc == 0 ? "OK" : "FAIL", rc);
    logmsg(line);

    rc = try_write("/proc/sys/vm/drop_caches", "3");
    snprintf(line, sizeof(line), "drop_caches=3: %s (errno=%d)\n",
             rc == 0 ? "OK" : "FAIL", rc);
    logmsg(line);

    rc = try_write("/proc/sys/vm/extra_free_kbytes", "1024");
    snprintf(line, sizeof(line), "extra_free_kbytes=1024: %s (errno=%d)\n",
             rc == 0 ? "OK" : "FAIL", rc);
    logmsg(line);

    rc = try_write("/proc/sys/vm/min_free_kbytes", "2048");
    snprintf(line, sizeof(line), "min_free_kbytes=2048: %s (errno=%d)\n",
             rc == 0 ? "OK" : "FAIL", rc);
    logmsg(line);
}

int main(void) {
    char ctx[128], line[256];

    /* Open log file */
    logfd = open("/data/local/tmp/sysctl-results.txt",
                 O_WRONLY | O_CREAT | O_TRUNC, 0666);

    /* Get root */
    prctl(PR_SET_KEEPCAPS, 1, 0, 0, 0);
    setgid(0);
    setuid(0);

    snprintf(line, sizeof(line), "uid=%d gid=%d\n", getuid(), getgid());
    logmsg(line);

    /* Test 1: zygote context (initial) */
    get_context(ctx, sizeof(ctx));
    snprintf(line, sizeof(line), "Initial context: %s\n", ctx);
    logmsg(line);
    try_sysctl("zygote (initial)");

    /* Test 2: system_server */
    if (try_setcon("u:r:system_server:s0") == 0) {
        try_sysctl("system_server");
    } else {
        logmsg("setcon system_server: FAILED\n");
    }

    /* Test 3: init */
    if (try_setcon("u:r:init:s0") == 0) {
        try_sysctl("init");
    } else {
        logmsg("setcon init: FAILED\n");
    }

    /* Test 4: kernel */
    if (try_setcon("u:r:kernel:s0") == 0) {
        try_sysctl("kernel");
    } else {
        logmsg("setcon kernel: FAILED\n");
    }

    /* Test 5: back to zygote */
    if (try_setcon("u:r:zygote:s0") == 0) {
        try_sysctl("zygote (restored)");
    } else {
        logmsg("setcon zygote: FAILED\n");
    }

    close(logfd);
    sleep(30);
    _exit(0);
}
