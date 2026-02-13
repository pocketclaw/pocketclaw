#!/data/data/com.termux/files/usr/bin/bash
PREFIX=/data/data/com.termux/files/usr
LOG=$PREFIX/tmp/check-git.log
echo "=== Git binary info ===" > "$LOG"
file $PREFIX/bin/git >> "$LOG" 2>&1
echo "" >> "$LOG"
echo "=== Linker files ===" >> "$LOG"
ls -la $PREFIX/lib/ld-* >> "$LOG" 2>&1
ls -la $PREFIX/lib/libc* >> "$LOG" 2>&1
echo "" >> "$LOG"
echo "=== readelf ===" >> "$LOG"
readelf -l $PREFIX/bin/git 2>&1 | grep -i interp >> "$LOG" 2>&1
echo "" >> "$LOG"
echo "=== git version ===" >> "$LOG"
git --version >> "$LOG" 2>&1
echo "=== Done ===" >> "$LOG"
rm -f ~/.bash_profile
