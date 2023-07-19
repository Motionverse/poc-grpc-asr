const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  publicPath: './',
  transpileDependencies: true,
  productionSourceMap: false,
  devServer: {
    https: true
  }
})
