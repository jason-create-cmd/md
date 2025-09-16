<script setup lang="ts">
const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([`close`])

const rewardLink = `https://pic.operonai.com/CleanShot%202025-06-23%20at%2021.12.57%402x.png`
const contributors = [
  {
    name: `个人赞赏码`,
    imageUrl: rewardLink,
    altText: `个人赞赏二维码`,
    link: rewardLink,
  },
]

function onUpdate(val: boolean) {
  if (!val) {
    emit(`close`)
  }
}
</script>

<template>
  <Dialog :open="props.visible" @update:open="onUpdate">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>赞赏</DialogTitle>
      </DialogHeader>
      <div class="text-center">
        <p>如果本项目对你有所帮助，可以通过个人收款码支持我，点击图片可在新窗口查看大图。</p>
        <div class="grid grid-cols-1 my-5 gap-4">
          <div v-for="contributor in contributors" :key="contributor.name" class="text-center">
            <a
              :href="contributor.link || contributor.imageUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                :src="contributor.imageUrl"
                :alt="contributor.altText"
                class="mx-auto"
                style="width: 90%; max-width: 220px; border-radius: 10%;"
              >
            </a>
            <p class="mt-2 text-sm text-muted-foreground">
              {{ contributor.name }}
            </p>
          </div>
        </div>
      </div>

      <DialogFooter class="sm:justify-evenly">
        <Button @click="emit('close')">
          关闭
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
