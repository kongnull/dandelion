
# 如何在 mac 上使用双 git 库，比如同时使用 github，又使用码云

以下是在 macOS 上同时使用 GitHub 和码云（Gitee）双 Git 库的配置步骤：

一、生成独立 SSH 密钥对

为 GitHub 生成密钥‌

bash
Copy Code
ssh-keygen -t rsa -C "github邮箱" -f ~/.ssh/github_id_rsa


按提示回车（无需设置密码）‌。

为码云生成密钥‌

bash
Copy Code
ssh-keygen -t rsa -C "码云邮箱" -f ~/.ssh/gitee_id_rsa


生成后会在 ~/.ssh 目录下得到 github_id_rsa、github_id_rsa.pub、gitee_id_rsa、gitee_id_rsa.pub 文件‌。

二、配置 SSH 身份识别
创建 ~/.ssh/config 文件‌
添加以下内容（若无此文件需新建）：
bash
Copy Code
# GitHub
Host github.com
  HostName github.com
  PreferredAuthentications publickey
  IdentityFile ~/.ssh/github_id_rsa

# 码云
Host gitee.com
  HostName gitee.com
  PreferredAuthentications publickey
  IdentityFile ~/.ssh/gitee_id_rsa

此配置使系统根据域名自动选择对应密钥‌。
三、添加公钥到平台

GitHub‌
复制 github_id_rsa.pub 内容：

bash
Copy Code
cat ~/.ssh/github_id_rsa.pub


粘贴到 GitHub 的 ‌Settings → SSH and GPG keys‌ 页面‌。

码云‌
复制 gitee_id_rsa.pub 内容：

bash
Copy Code
cat ~/.ssh/gitee_id_rsa.pub


粘贴到码云的 ‌个人设置 → SSH 公钥‌ 页面‌。

四、验证连接

测试 GitHub 连接‌

bash
Copy Code
ssh -T git@github.com


成功会显示 You've successfully authenticated‌。

测试码云连接‌

bash
Copy Code
ssh -T git@gitee.com


成功会显示 Welcome to Gitee‌。

五、配置本地仓库

取消全局用户配置（若已设置）‌

bash
Copy Code
git config --global --unset user.name
git config --global --unset user.email


按仓库设置用户信息‌
进入项目目录后执行：

bash
Copy Code
# 针对 GitHub 仓库
git config --local user.name "GitHub用户名"
git config --local user.email "GitHub邮箱"

# 针对码云仓库
git config --local user.name "码云用户名"
git config --local user.email "码云邮箱"


此操作确保提交记录与对应平台账号关联‌。

六、关联远程仓库

添加多个远程仓库地址‌

bash
Copy Code
git remote add github git@github.com:用户名/仓库名.git
git remote add gitee git@gitee.com:用户名/仓库名.git


推送代码‌

bash
Copy Code
git push github main   # 推送到 GitHub
git push gitee main    # 推送到码云

注意事项
密钥权限问题‌：确保 ~/.ssh 目录权限为 700，私钥文件权限为 600‌。
调试工具‌：若连接失败，可通过 ssh -vT git@github.com 查看详细日志‌。



# 本地一套代码可以同时推两个库吗

本地一套代码可以同时推送到两个远程仓库（如GitHub和码云），实现方法如下：

一、核心配置原理

通过为不同远程仓库设置独立别名，并绑定对应的SSH密钥，实现‌单本地仓库同时关联多个远程仓库‌。推送时需分别指定别名，或通过修改配置文件实现一键双推‌。

二、具体操作步骤

关联多个远程仓库‌

方法一：命令行添加别名‌

bash
Copy Code
# 添加 GitHub 仓库
git remote add github git@github.com:用户名/仓库名.git
# 添加码云仓库
git remote add gitee git@gitee.com:用户名/仓库名.git


通过 git remote -v 可验证配置‌。

方法二：修改 .git/config 文件‌
在项目根目录的 .git/config 文件中添加：

ini
Copy Code
[remote "github"]
  url = git@github.com:用户名/仓库名.git
  fetch = +refs/heads/*:refs/remotes/github/*
[remote "gitee"]
  url = git@gitee.com:用户名/仓库名.git
  fetch = +refs/heads/*:refs/remotes/gitee/*


此方法支持直接编辑配置文件‌。

推送代码到双仓库‌

分别推送‌

bash
Copy Code
git push github main  # 推送到 GitHub
git push gitee main   # 推送到码云


需手动执行两次推送命令‌。

一键双推（需配置多 URL）‌
在 .git/config 的 [remote "origin"] 下添加多个 URL：

ini
Copy Code
[remote "origin"]
  url = git@github.com:用户名/仓库名.git
  url = git@gitee.com:用户名/仓库名.git


执行 git push origin main 可同时推送至两个仓库‌。

三、验证配置

检查远程仓库关联状态‌

bash
Copy Code
git remote -v


输出应显示 github 和 gitee（或 origin 含双地址）‌。

测试推送结果‌
分别访问 GitHub 和码云仓库页面，确认代码已同步‌。

四、注意事项
SSH 密钥区分‌：需为 GitHub 和码云生成独立的 SSH 密钥对，并在 ~/.ssh/config 中配置域名与密钥的映射关系‌。
分支一致性‌：确保本地分支与远程分支名称一致（如 main），避免推送失败‌。
冲突处理‌：若两仓库内容不同步，建议先执行 git pull 合并变更后再推送‌。

通过上述配置，单套本地代码即可实现双仓库同步推送，适用于需要多平台备份或加速访问的场景‌。