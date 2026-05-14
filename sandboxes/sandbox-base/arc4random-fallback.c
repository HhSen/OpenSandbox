/* Override glibc arc4random_buf / arc4random / getentropy to read from
 * /dev/urandom when the getrandom(2) syscall is blocked by the container's
 * seccomp profile.  Ubuntu 24.04 glibc 2.39 calls getrandom(GRND_NONBLOCK)
 * and aborts fatally on EPERM/ENOSYS — this shim prevents that crash.
 */
#define _GNU_SOURCE
#include <stddef.h>
#include <stdint.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>

static void read_urandom(void *buf, size_t n) {
    int fd = open("/dev/urandom", O_RDONLY | O_CLOEXEC);
    if (fd < 0) return;
    size_t off = 0;
    while (off < n) {
        ssize_t r = read(fd, (char *)buf + off, n - off);
        if (r <= 0) break;
        off += r;
    }
    close(fd);
}

void arc4random_buf(void *buf, size_t n) {
    read_urandom(buf, n);
}

uint32_t arc4random(void) {
    uint32_t val;
    read_urandom(&val, sizeof(val));
    return val;
}

/* getentropy(3) is used by OpenSSL and other libraries; max 256 bytes per POSIX */
int getentropy(void *buf, size_t len) {
    if (len > 256) {
        errno = EIO;
        return -1;
    }
    read_urandom(buf, len);
    return 0;
}
