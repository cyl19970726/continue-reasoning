在我们之前的实现实现里遇到了一些问题：
主要是状态连续性的问题，这个问题触发的原因是我们可能会有一些文件不是通过 /Users/hhh0x/agent/continue-reasoning/packages/agents/contexts/coding/toolsets/snapshot-enhanced-tools.ts
来实现的：
举例：例如我们在代码里有fs.write(file.txt)的操作，这种操作是无法被检测到的。我们的simple-snapshot-manager无法知道我们对file.txt有修改，除非在我们append任何snapshot之前，先对整个文件目录检查下有没有在simple-snapshot-manager
之外的修改，如果有我们要试图给这些修改生成diff，并且记录起来，这样的好处是我们不会遇到状态连续性的错误，整个系统也可以接受非snapshot-enhanced-tools.ts 之外的修改，否则我们现在的snapshot + milestone肯定无法支持。


## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CodingAgent                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   CodingContext                             ││
│  │  ┌───────────────┐  ┌─────────────────┐  ┌───────────────┐ ││
│  │  │   IRuntime    │  │ SimpleSnapshot  │  │   Toolsets    │ ││
│  │  │               │  │    Manager      │  │               │ ││
│  │  │ ┌───────────┐ │  │                 │  │ ┌───────────┐ │ ││
│  │  │ │File Ops   │ │  │ ┌─────────────┐ │  │ │ Edit Tools│ │ ││
│  │  │ │Diff Gen   │ │  │ │  Snapshots  │ │  │ │ Bash Tools│ │ ││
│  │  │ │Patch Ops  │ │  │ │  Index      │ │  │ │ Snapshot  │ │ ││
│  │  │ └───────────┘ │  │ │  Milestones │ │  │ │ Tools     │ │ ││
│  │  └───────────────┘  │ └─────────────┘ │  │ └───────────┘ │ ││
│  │                     └─────────────────┘  └───────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                  File System Storage                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │    .continue-reasoning/                                     ││
│  │    ├── snapshots/                                           ││
│  │    │   ├── index.json                                       ││
│  │    │   └── 2024/01/29/snapshot-uuid1.json                  ││
│  │    └── milestones/                                          ││
│  │        ├── index.json                                       ││
│  │        ├── milestone-uuid1.json                             ││
│  │        └── milestone-uuid2.json                             ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```
现在有两个潜在的解决方案： 
1. 让整个项目不再做连续状态检查，甚至放弃milestones
2. 在执行 enhanced-snapshot-tools的时候要先检查整个项目有没有在上一次做 enhanced-sanpshot-tool 之后有非enhanced-sanpshot-tool 之外的写或者修改。
怎么检测修改：
1.我们当前项目是怎么初始化整个项目的状态的？是通过记录所有的文件哈希然后生成文件夹哈希吗
2.如果是通过记录文件哈希的方式，我们可以在当前enhanced-sanpshot-tool(后面用tool-1代替)要执行的时候检查 文件夹目录哈希是否跟原来一致，以及为了生成对应的diff，如果我们不存有在上一个enhanced-snapshot-tool(后面用tool-0代替)执行后 checkpoint(后面用 after-tool-0-checkpoint 代替) 的所有文件副本，那么加入在 tool-0和tool-1之间真的有别的修改操作发生，我们可能可以通过检查文件哈希的方式得到对应的那些文件有不被snapshot manager捕捉的修改，但是我们无法生成对应的diff.因为我们不知道 after-tool-0之后的文件内容，我们只有当前也就是after-tool-1的文件内容，以及 tool-0和tool-1之间的修改diff不可知(unknown diff).
所以我们要实现：
1. 检查是否有不可知的修改
2. 存储每一个 snapshot-tool修改之后的文件副本，但是只要保留最新的那份，因为我们可以追踪所有的diff,从而拥有可以回退到任意时刻的能力[不过这个可以有一个config option，也可以支持保留所有checkpoint的文件副本]
