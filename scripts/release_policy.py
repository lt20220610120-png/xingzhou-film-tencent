"""Release ordering shared by publisher and mirror."""
import re


def version_tuple(version):
    if not isinstance(version,str) or not re.fullmatch(r'(?:0|[1-9][0-9]{0,8})(?:\.(?:0|[1-9][0-9]{0,8})){2}',version):
        raise ValueError(f"无效的正式版本号 {version!r}")
    return tuple(map(int,version.split('.')))


def check_release_order(version, digest, size, channels, *, resume=False, rollback=False):
    target=version_tuple(version)
    for channel, manifest in channels.items():
        current=version_tuple(manifest["version"])
        if target==current:
            if (manifest["sha256"],manifest["size"])!=(digest,size):
                raise ValueError(f"{channel} 的 {version} 已绑定其他安装包")
            if not (resume or rollback):
                raise ValueError(f"{channel} 已是 {version}，继续同一安装包须使用 --resume")
        if target<current and not rollback:
            raise ValueError(f"{channel} 当前版本 {manifest['version']} 高于 {version}，回滚须使用 --allow-rollback")
