import process from 'node:process'
import { defineConfig } from './src/index'

export default defineConfig({
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
})
