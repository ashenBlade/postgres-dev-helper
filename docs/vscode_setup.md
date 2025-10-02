# Visual Studio Code setup

Here is shown VS Code setup for PostgreSQL debugging.

## Extensions

### PostgreSQL Hacker Helper

This is the main extension we are talking about. It significantly simplifies development and debugging of source code.

[Link](https://marketplace.visualstudio.com/items?itemName=ash-blade.postgresql-hacker-helper).

This is the only extension I recommend installing, because there are no alternatives to it.
For the further extensions you are free to choose that suit you - no restrictions, just suggestions.

### Debugger extension

First things first, you have to install debugger extension, which will provide debugging functionality.

There are 2 supported (by PostgreSQL Hacker Helper) debugger extensions:

- [C/C++](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cpptools)
- [CodeLLDB](https://marketplace.visualstudio.com/items?itemName=vadimcn.vscode-lldb)

Which one to choose is up to you, but I use a rule of thumb: if have built source code using `gcc`, then C/C++ with `dbg` debugger, otherwise (`clang`) use `CodeLLDB` with `lldb` debugger.

Also, you would like to have autocompletions. You can use [IntelliCode Completions](https://marketplace.visualstudio.com/items?itemName=VisualStudioExptTeam.vscodeintellicode-completions).

### Perl

PostgreSQL has different test types. One of them is TAP-tests which are written in Perl, so you might want to add extension with Perl support.

Example, [Perl](https://marketplace.visualstudio.com/items?itemName=richterger.perl) extension.

### Markdown

This is utility extension that will help create markdown files.
They are popular because many documentation or README are written using Markdown syntax.

Example: [Markdown All in One](https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one).

### SQL queries

SQL is the main language, so SQL-syntax support is must-have.

You can use builtin SQL syntax support, or install [Better PostgreSQL syntax](https://marketplace.visualstudio.com/items?itemName=felixfbecker.postgresql-syntax) extension which provides several PostgreSQL specific syntax features, like type cast.

### Database connections

When developing you may need to connect to database and execute queries.
For this you can choose any tool: `psql`, `pgAdmin` or vs code extension.

There is no recommendation, because I do not use VS Code extension: only `psql` or `pgAdmin`, because VS Code extension targets primarily on Database usage while I am as database *source code* developer can request specific features that general extension does not provide. In example, I can create patch, that breaks binary protocol compatibility or adds extensions to it, which is obviously not supported by extension. Thus it is more preferable to have your own automation scripts.

Moreover, you may have multiple different versions of PostgreSQL installed on your system simultaneously and again, it is unlikely that the general solution (extension) takes into account such features.

## `launch.json`

File `.vscode/launch.json` describes debug session configuration: name, debugger, path to binary/pid to attach, launch args, etc...
When we are talking about PostgreSQL you should remember that it has multi-process architecture, not multi-threaded, this defines how we start debugging.
Next, typical configurations for different uses cases will be presented.

### Backend

Mostly you will be debugging a backend. It forks from postmaster, setup it's own state and then start main query processing loop.
As it forks, then we can not just launch backend as usual binary - we have to attach to specific pid.

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Backend (cppdbg)",
            "type": "cppdbg",
            "request": "attach",
            "program": "${workspaceFolder}/src/backend/postgres",
            "processId": "${command:pickProcess}",
            "MIMode": "gdb",
            "setupCommands": [
                {
                    "description": "Enable pretty-printing for gdb",
                    "text": "-enable-pretty-printing",
                    "ignoreFailures": true
                }
            ],
            "internalConsoleOptions": "neverOpen", 
        },
        {
            "name": "Backend (lldb)",
            "type": "lldb",
            "request": "attach",
            "program": "${workspaceFolder}/src/backend/postgres",
            "pid": "${command:pickProcess}",
            "internalConsoleOptions": "neverOpen"
        }
    ]
}
```

These are template configurations created by default, but with some customization:

1. To get PID of process special value is used: `${command:pickProcess}` - it will open quick pick window where you can choose backend to attach.
   It shows all running processes, but actually all you have to do is to type "postgres" and choose penultimate element - usually it is the only running backend.
   ![Shown quick-pick window with target backend](./img/vscode_setup/quickpick_pid.png)
2. `"program"` points to `src/backend/postgres` - default location of `postgres` binary. It contains all server debug symbols and it's location do not change, so you do not have to specify installation path each time.
3. `internalConsoleOptions` is set to `neverOpen` because when debugging starts C/C++ extension opens `Debug Console` and shows logs, but usually it is not necessary and just only knocks down the focus.

### Frontend

Frontend - are all utilities that run outside the server, i.e. `pg_dump`, `pg_ctl`, etc...

They are separate binaries, so you can launch them directly, but usually they interact with the database, so they need database installation info.

We can pass it directly using flags, but a better idea would be to use environment variables, because different binaries can use different flags.

All frontend utilities are located in own `src/bin/UTILITY_NAME` directory and after building each directory contains it's binary.

For example configuration for `pg_ctl` would be:

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "pg_ctl",
            "type": "cppdbg",
            "request": "launch",
            "program": "${workspaceFolder}/src/bin/pg_ctl/pg_ctl",
            "cwd": "${workspaceFolder}",
            "args": [
                "status"
            ],
            "environment": [
                {
                    "name": "PGDATA",
                    "value": "${workspaceFolder}/data"
                }
            ]
        }
    ]
}
```

Here we are debugging `pg_ctl status` command (see `"args"`) and pass `PGDATA` environment variable directly.

The value of it can be any, but in the example I suppose that for development purposes your installation in `data` directory in the repository itself.

> A better idea than passing environment variables would be to pass environmental variable *file*.
> It have 2 benefits against manual specifying:
>
> 1. This file can be automatically generated during database creation
> 2. If you have configuration for multiple binaries, then you do not have to enter the same parameters - just pass this env file.

## `tasks.json`

TODO
