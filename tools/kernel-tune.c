// kernel-tune.c — Dirty COW payload for zygote context
// Tunes LMK minfree + swappiness via raw ARM syscalls
// Cross-compile: armv7a-linux-androideabi23-clang -nostdlib -static -Os -o kernel-tune kernel-tune.c

// ARM syscall numbers
#define SYS_exit   1
#define SYS_write  4
#define SYS_open   5
#define SYS_close  6

#define O_WRONLY 1

static int my_open(const char *path, int flags) {
    register int r0 __asm__("r0") = (int)path;
    register int r1 __asm__("r1") = flags;
    register int r7 __asm__("r7") = SYS_open;
    __asm__ volatile("svc 0" : "+r"(r0) : "r"(r1), "r"(r7) : "memory");
    return r0;
}

static int my_write(int fd, const void *buf, int len) {
    register int r0 __asm__("r0") = fd;
    register int r1 __asm__("r1") = (int)buf;
    register int r2 __asm__("r2") = len;
    register int r7 __asm__("r7") = SYS_write;
    __asm__ volatile("svc 0" : "+r"(r0) : "r"(r1), "r"(r2), "r"(r7) : "memory");
    return r0;
}

static void my_close(int fd) {
    register int r0 __asm__("r0") = fd;
    register int r7 __asm__("r7") = SYS_close;
    __asm__ volatile("svc 0" : "+r"(r0) : "r"(r7) : "memory");
}

static void my_exit(int code) {
    register int r0 __asm__("r0") = code;
    register int r7 __asm__("r7") = SYS_exit;
    __asm__ volatile("svc 0" : : "r"(r0), "r"(r7));
}

static int my_strlen(const char *s) {
    int n = 0;
    while (s[n]) n++;
    return n;
}

static void write_file(const char *path, const char *val) {
    int fd = my_open(path, O_WRONLY);
    if (fd >= 0) {
        my_write(fd, val, my_strlen(val));
        my_close(fd);
        my_write(1, "OK: ", 4);
    } else {
        my_write(1, "FAIL: ", 6);
    }
    my_write(1, path, my_strlen(path));
    my_write(1, "\n", 1);
}

void _start(void) {
    // LMK minfree — lower thresholds (in 4KB pages)
    // New: 16,20,24,28,48,56 MB  (was: 44,52,60,68,144,168 MB)
    write_file("/sys/module/lowmemorykiller/parameters/minfree",
               "4096,5120,6144,7168,12288,14336");

    // Swappiness — 60 (balanced, was 100)
    write_file("/proc/sys/vm/swappiness", "60");

    my_write(1, "KERNEL_TUNE_DONE\n", 17);
    my_exit(0);
}
