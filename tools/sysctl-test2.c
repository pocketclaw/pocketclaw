/*
 * Test payload v2: try ctl.start qcom-post-boot and write results.
 * Also try writing to sysfs_lowmemorykiller (different SELinux type).
 */
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <sys/prctl.h>

extern int __system_property_set(const char *key, const char *value);

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

static int try_write(const char *path, const char *value) {
    int fd = open(path, O_WRONLY);
    if (fd < 0) return errno;
    int ret = write(fd, value, strlen(value));
    int err = errno;
    close(fd);
    return (ret > 0) ? 0 : err;
}

static void read_val(const char *path, char *buf, int len) {
    int fd = open(path, O_RDONLY);
    if (fd < 0) { snprintf(buf, len, "ERR:%d", errno); return; }
    int n = read(fd, buf, len - 1);
    close(fd);
    if (n > 0) { buf[n] = '\0'; if (buf[n-1]=='\n') buf[n-1]='\0'; }
    else snprintf(buf, len, "EMPTY");
}

int main(void) {
    char buf[128], line[256];

    logfd = open("/data/local/tmp/sysctl-results2.txt",
                 O_WRONLY | O_CREAT | O_TRUNC, 0666);
    if (logfd < 0) {
        /* Try /dev/kmsg or /sdcard instead */
        logfd = open("/sdcard/sysctl-results2.txt",
                     O_WRONLY | O_CREAT | O_TRUNC, 0666);
    }

    prctl(PR_SET_KEEPCAPS, 1, 0, 0, 0);
    setgid(0);
    setuid(0);
    try_setcon("u:r:system_server:s0");

    snprintf(line, sizeof(line), "uid=%d gid=%d\n", getuid(), getgid());
    logmsg(line);

    /* Test 1: Write to sysfs_lowmemorykiller (different SELinux type) */
    logmsg("\n=== sysfs_lowmemorykiller writes (system_server) ===\n");

    read_val("/sys/module/lowmemorykiller/parameters/minfree", buf, sizeof(buf));
    snprintf(line, sizeof(line), "minfree before: %s\n", buf);
    logmsg(line);

    /* Try setting more aggressive LMK thresholds (in pages) */
    int rc = try_write("/sys/module/lowmemorykiller/parameters/minfree",
                       "11264,13312,15360,17408,24576,30720");
    snprintf(line, sizeof(line), "minfree write: %s (errno=%d)\n",
             rc == 0 ? "OK" : "FAIL", rc);
    logmsg(line);

    read_val("/sys/module/lowmemorykiller/parameters/minfree", buf, sizeof(buf));
    snprintf(line, sizeof(line), "minfree after: %s\n", buf);
    logmsg(line);

    /* Test 2: Try ctl.start qcom-post-boot */
    logmsg("\n=== ctl.start qcom-post-boot ===\n");
    __system_property_set("ctl.start", "qcom-post-boot");
    logmsg("ctl.start sent\n");

    /* Wait a moment for the service to start */
    sleep(3);

    /* Read sysctl values after (post_boot might have set them) */
    read_val("/proc/sys/vm/vfs_cache_pressure", buf, sizeof(buf));
    snprintf(line, sizeof(line), "vfs_cache_pressure: %s\n", buf);
    logmsg(line);

    /* Test 3: Try writing to /proc/sys/vm as init (via ctl.start trick) */
    logmsg("\n=== Direct proc write test ===\n");

    rc = try_write("/proc/sys/vm/vfs_cache_pressure", "500");
    snprintf(line, sizeof(line), "vfs_cache_pressure=500: %s (errno=%d)\n",
             rc == 0 ? "OK" : "FAIL", rc);
    logmsg(line);

    /* Test 4: Try /proc/sys via different syscall - sysctl(2) */
    logmsg("\nDone.\n");

    close(logfd);
    sleep(30);
    _exit(0);
}
