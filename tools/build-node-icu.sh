#!/bin/bash
set -e

NDK="$HOME/android-ndk-r26c"
TC="$NDK/toolchains/llvm/prebuilt/linux-x86_64"
API=24

cd "$HOME/node"
rm -rf out/

echo "=== Configuring API $API (with small-icu) ==="
export PATH="$TC/bin:$PATH"
export CC="$TC/bin/armv7a-linux-androideabi${API}-clang"
export CXX="$TC/bin/armv7a-linux-androideabi${API}-clang++"
export CC_host="gcc"
export CXX_host="g++"
export LINK_host="g++"
export GYP_DEFINES="target_arch=arm v8_target_arch=arm android_target_arch=arm host_os=linux OS=android android_ndk_path=$NDK"

./configure \
    --dest-cpu=arm \
    --dest-os=android \
    --cross-compiling \
    --openssl-no-asm \
    --with-intl=small-icu \
    --without-inspector \
    --without-corepack \
    --without-npm 2>&1

echo "=== Post-configure: fix host asm files (x64 -> ia32 for -m32 compat) ==="
find out/ -name '*.host.mk' -exec sed -i 's|asm/x64/push_registers_asm|asm/ia32/push_registers_asm|g' {} \;
echo "Patched asm references in host makefiles"

echo "=== Post-configure: fix ICU host tools to use -m32 (match V8 host builds) ==="
# ICU host tools default to -m64, but V8 host tools use -m32 for ARM target compat.
# When V8 host tools link ICU, they need matching architecture.
find out/ -name '*.host.mk' -exec sed -i 's/-m64/-m32/g' {} \;
echo "Patched ICU host makefiles: -m64 -> -m32"

echo "=== Building with $(nproc) cores ==="
make -j$(nproc) node 2>&1

echo "=== DONE ==="
ls -lh out/Release/node
file out/Release/node
