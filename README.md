# 剧本杀排班系统

单店使用的 H5 剧本杀排班系统。

## 开发启动

```bash
npm install
npm run dev
```

默认地址：

- 前端：`http://localhost:5173`
- 后端健康检查：`http://localhost:3001/api/health`

## 使用流程

1. 用管理密码 `admin123` 登录。
2. 在右侧后台配置里添加剧本、DM、房间。
3. 回到左侧月历，选择日期后点击新增。
4. 选择剧本、开场时间、房间和每个角色对应的 DM。
5. 保存后可以在月历和当天详情里查看。

查看用户使用查看密码 `view123` 登录，只能查看排班，不能修改。

## 数据库

项目使用 SQLite。默认数据库文件位置：

```bash
server/data/app.sqlite
```

初始化或重复校验数据库结构：

```bash
npm run db:init
```

默认密码会写入 `settings` 表：

- 管理密码：`admin123`
- 查看密码：`view123`

后续可以直接修改数据库中的 `settings.value` 来调整密码。

## 登录权限

登录接口：

```bash
POST /api/auth/login
```

请求体：

```json
{
  "password": "admin123"
}
```

返回：

```json
{
  "role": "admin",
  "token": "..."
}
```

后续接口使用：

```bash
Authorization: Bearer <token>
```

当前权限：

```bash
GET /api/auth/me
```

管理权限保护示例：

```bash
GET /api/admin/health
```

## 后台配置接口

以下接口都需要管理权限：

```bash
GET /api/admin/scripts
POST /api/admin/scripts
PUT /api/admin/scripts/:id

GET /api/admin/dms
POST /api/admin/dms
PUT /api/admin/dms/:id

GET /api/admin/rooms
POST /api/admin/rooms
PUT /api/admin/rooms/:id
```

## 排班接口

查看排班需要登录，查看密码和管理密码都可以：

```bash
GET /api/schedules?from=2026-07-01&to=2026-08-01
```

以下接口需要管理权限：

```bash
POST /api/admin/schedules/availability
POST /api/admin/schedules
PUT /api/admin/schedules/:id
DELETE /api/admin/schedules/:id
```

## 报表接口

以下接口需要管理权限：

```bash
GET /api/admin/reports/monthly.xlsx?from=2026-07-01&to=2026-08-01
GET /api/admin/reports/dm-summary?from=2026-07-01&to=2026-08-01
```

页面上支持：

- 导出当前月份排班为 Excel 文件
- 查询当前月份每个 DM 的总排班数和排班明细
- 配置每个剧本角色的 DM 工资
- 导出每月 DM 工资汇总和工资明细

创建/编辑排班请求体：

```json
{
  "scriptId": 1,
  "roomId": 1,
  "date": "2026-07-08",
  "startTime": "10:00",
  "note": "客户备注",
  "assignments": [
    {
      "roleName": "侦探",
      "dmId": 1
    }
  ]
}
```

剧本角色支持配置工资，保存排班时会把当时的角色工资写入排班快照。之后修改剧本角色工资，不会影响已经保存过的历史排班工资。

当前已实现校验：

- 开场时间必须是每 30 分钟
- 自动按剧本整数小时计算结束时间
- 房间占用到结束后 10 分钟
- 工作日按早上 8 点刷新
- 同剧本重叠时间不能超过最大车数
- 同房间重叠时间不能冲突
- DM 同一工作日只能接一车
- DM 必须会所选角色
- 同一场里一个 DM 只能扮演一个角色
- 每个剧本角色都必须选择 DM

## 交付前检查

前端构建：

```bash
npm run build
```

接口冒烟测试，需要先启动 `npm run dev`：

```bash
npm run test:smoke
```

冒烟测试会临时创建剧本、DM、房间和排班，验证完成后只清理自己创建的数据。

## Debian 12 最简部署

项目已经内置 Docker 部署文件：

- `Dockerfile`
- `docker-compose.yml`

服务器只需要安装 Docker，然后启动容器即可。下面命令默认把系统开放在服务器 `80` 端口。

### 1. 在 Debian 12 安装 Docker

```bash
sudo apt update
sudo apt install -y ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

### 2. 上传项目到服务器

如果你本地有这个项目目录，可以在本机执行：

```bash
rsync -av --exclude node_modules --exclude client/dist --exclude server/data /Users/chufan/Desktop/测试项目/ root@你的服务器IP:/opt/murder-mystery-scheduler/
```

如果你后续放到 Git 仓库，也可以在服务器上直接：

```bash
git clone 你的仓库地址 /opt/murder-mystery-scheduler
```

### 3. 启动

在服务器上执行：

```bash
cd /opt/murder-mystery-scheduler
cat > .env <<'EOF'
APP_PORT=80
AUTH_TOKEN_SECRET=请改成一串很长的随机字符串
EOF
docker compose up -d --build
```

启动后访问：

```bash
http://你的服务器IP/
```

默认密码：

- 管理密码：`admin123`
- 查看密码：`view123`

数据会保存在服务器项目目录下：

```bash
/opt/murder-mystery-scheduler/server-data/app.sqlite
```

以后更新代码后，在服务器上执行：

```bash
cd /opt/murder-mystery-scheduler
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f
```

停止服务：

```bash
docker compose down
```

## 当前进度

- 第 1 步：项目初始化与技术底座，已完成
- 第 2 步：数据库表设计与初始化数据，已完成
- 第 3 步：登录与权限系统，已完成
- 第 4 步：后台配置功能，已完成
- 第 5 步：排班核心逻辑接口，已完成
- 第 6 步：H5 月历排班界面，已完成
- 第 7 步：添加 / 编辑排班弹窗，已完成
- 第 8 步：测试、修复与交付，已完成
