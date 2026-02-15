/*
 * API 23 compatibility shim for Node.js 22 + ICU on Android 6.0
 * Provides symbols that exist in API 24+ bionic but not API 23.
 * Compile as shared lib, use via LD_PRELOAD.
 */

#define _GNU_SOURCE
#include <netinet/in.h>
#include <stdio.h>
#include <string.h>
#include <errno.h>
#include <pthread.h>
#include <ifaddrs.h>
#include <pwd.h>
#include <grp.h>

/* --- Network constants (API 24) --- */
const struct in6_addr in6addr_any = IN6ADDR_ANY_INIT;
const struct in6_addr in6addr_loopback = IN6ADDR_LOOPBACK_INIT;

/* --- getifaddrs / freeifaddrs (API 24) --- */
/* Stub: return empty list. Node.js os.networkInterfaces() handled by hijack.js */
int getifaddrs(struct ifaddrs **ifap) {
    *ifap = NULL;
    return 0;
}

void freeifaddrs(struct ifaddrs *ifa) {
    (void)ifa;
}

/* --- getgrnam_r / getgrgid_r (API 24) --- */
int getgrnam_r(const char *name, struct group *grp, char *buf,
               size_t buflen, struct group **result) {
    (void)name; (void)grp; (void)buf; (void)buflen;
    *result = NULL;
    return 0; /* group not found */
}

int getgrgid_r(gid_t gid, struct group *grp, char *buf,
               size_t buflen, struct group **result) {
    (void)gid; (void)grp; (void)buf; (void)buflen;
    *result = NULL;
    return 0; /* group not found */
}

/* --- fseeko64 / ftello64 (API 24) --- */
/* On 32-bit Android, these are the large-file variants */
typedef long long off64_t;
int fseeko64(FILE *stream, off64_t offset, int whence) {
    return fseek(stream, (long)offset, whence);
}

off64_t ftello64(FILE *stream) {
    return (off64_t)ftell(stream);
}

/* --- pthread_barrier (API 24) --- */
/* Minimal implementation using mutex + condvar */
typedef struct {
    pthread_mutex_t mutex;
    pthread_cond_t cond;
    unsigned count;
    unsigned waiting;
    unsigned phase;
} my_barrier_t;

#ifndef PTHREAD_BARRIER_SERIAL_THREAD
#define PTHREAD_BARRIER_SERIAL_THREAD -1
#endif

int pthread_barrier_init(pthread_barrier_t *barrier,
                         const pthread_barrierattr_t *attr,
                         unsigned count) {
    (void)attr;
    my_barrier_t *b = (my_barrier_t *)barrier;
    if (count == 0) return EINVAL;
    pthread_mutex_init(&b->mutex, NULL);
    pthread_cond_init(&b->cond, NULL);
    b->count = count;
    b->waiting = 0;
    b->phase = 0;
    return 0;
}

int pthread_barrier_wait(pthread_barrier_t *barrier) {
    my_barrier_t *b = (my_barrier_t *)barrier;
    pthread_mutex_lock(&b->mutex);
    unsigned phase = b->phase;
    b->waiting++;
    if (b->waiting == b->count) {
        b->waiting = 0;
        b->phase++;
        pthread_cond_broadcast(&b->cond);
        pthread_mutex_unlock(&b->mutex);
        return PTHREAD_BARRIER_SERIAL_THREAD;
    }
    while (phase == b->phase) {
        pthread_cond_wait(&b->cond, &b->mutex);
    }
    pthread_mutex_unlock(&b->mutex);
    return 0;
}

int pthread_barrier_destroy(pthread_barrier_t *barrier) {
    my_barrier_t *b = (my_barrier_t *)barrier;
    pthread_mutex_destroy(&b->mutex);
    pthread_cond_destroy(&b->cond);
    return 0;
}
