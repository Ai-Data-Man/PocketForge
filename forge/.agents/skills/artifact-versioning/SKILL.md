---
name: artifact-versioning
description: 制品版本管理约定——覆盖或大改已有制品前先存一版，让用户随时能回到旧版。凡是要修改 data/artifacts 下已存在的文件，都按本技能操作。
---

# 制品版本管理（给你的规矩）

每个对话有自己的工作区文件夹：`data/artifacts/ws-月日-时分秒/`。用户的所有交付物、上传的文件都放在当前对话的工作区里。界面上每个文件旁有个 🕘 按钮，能看到你存的每一版和说明——所以说明要写人话。

## 规矩

1. **新建**文件：不用存版本，正常写。
2. **覆盖或大改一个已存在的文件之前**，必须先存当前版（注意路径里带上工作区文件夹）：

```
node bin\artifact-vcs.js snapshot data/artifacts/<工作区> data/artifacts/<工作区>/<文件> -m "<大白话说明>"
```

3. `-m` 说明写清楚"为什么改、改了什么"。例如：
   - 好：`按王姐说的把合计列加粗了`
   - 差：`update v2 fix`
4. 改完后主动告诉用户："不满意的话，在文件旁点 🕘 就能回到刚才那版"。
5. 用户想反悔时，帮他恢复：

```
node bin\artifact-vcs.js log      data/artifacts/<工作区> data/artifacts/<工作区>/<文件>     （看有哪些版本）
node bin\artifact-vcs.js restore  data/artifacts/<工作区> data/artifacts/<工作区>/<文件> <版本号>
```

恢复前会自动把现在的内容也存一版，不会丢东西。

6. 用户提到以前对话做的东西时：它的完整路径形如 `data/artifacts/ws-xxxx/...`。直接用这个路径读和改就行；改之前同样先 snapshot。
