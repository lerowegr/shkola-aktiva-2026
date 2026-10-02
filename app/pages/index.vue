<script setup lang="ts">
import { landingCta, type LandingStage } from "~/landing/cta";
import { hasContent, type SiteContent } from "~~/lib/site/content";

/**
 * Главная: сайт Школы Актива. Тексты — из админки («Сайт»), даты этапов —
 * из «Этапов». Пустые разделы не показываются.
 */
const { data } = await useFetch("/api/site");
const user = await useSession();

const content = computed(() => data.value!.content as SiteContent);
const stages = computed(() => (data.value?.season?.stages ?? []) as unknown as LandingStage[]);
const year = computed(() => data.value?.season?.year ?? 2026);
const cta = computed(() => landingCta(stages.value, user.value, mskFormat));
const closesAt = computed(() => stages.value.find((stage) => stage.kind === "APPLICATION")?.closesAt ?? null);
const show = (key: Parameters<typeof hasContent>[1]) => hasContent(content.value, key);

const links = computed(() =>
  [
    { href: "#o-shkole", label: "О Школе", show: show("about") },
    { href: "#otbor", label: "Отбор", show: stages.value.length > 0 },
    { href: "#programma", label: "Программа", show: show("program") },
    { href: "#lyudi", label: "Люди", show: show("people") },
    { href: "#mesto", label: "Где и когда", show: show("venue") },
    { href: "#voprosy", label: "Вопросы", show: show("faq") },
  ].filter((link) => link.show),
);

const url = useRuntimeConfig().public.appUrl.replace(/\/$/, "");
const description = computed(() => content.value.hero.tagline || "Отбор в Школу Актива: анкета, задание и собеседование.");

useSeoMeta({
  title: `Школа Актива ${year.value}`,
  titleTemplate: "%s",
  description,
  ogTitle: `Школа Актива ${year.value}`,
  ogDescription: description,
  ogType: "website",
  ogUrl: `${url}/`,
  ogImage: `${url}/brand/og.jpg`,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogLocale: "ru_RU",
  twitterCard: "summary_large_image",
});

// Разметка для поиска и ответов нейросетей: кто мы и частые вопросы.
useHead({
  // Системная полоса прокрутки на главной скрыта: вместо неё LandingScrollbar.
  htmlAttrs: { class: "landing" },
  link: [{ rel: "canonical", href: `${url}/` }],
  script: [
    {
      type: "application/ld+json",
      innerHTML: computed(() =>
        JSON.stringify([
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Школа Актива",
            url: `${url}/`,
            logo: `${url}/brand/logo-sticker.webp`,
            sameAs: [content.value.contacts.telegram, content.value.contacts.vk].filter(Boolean),
          },
          ...(show("faq")
            ? [
                {
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: content.value.faq.items.map((item) => ({
                    "@type": "Question",
                    name: item.question,
                    acceptedAnswer: { "@type": "Answer", text: item.answer },
                  })),
                },
              ]
            : []),
        ]),
      ),
    },
  ],
});
</script>

<template>
  <div class="relative overflow-x-clip">
    <LandingHeader :cta="cta" :links="links" />
    <main>
      <LandingHero :cta="cta" :tagline="content.hero.tagline" :closes-at="closesAt" />
      <LandingMarquee />
      <LandingAbout v-if="show('about')" :about="content.about" />
      <LandingSelection v-if="stages.length" :selection="content.selection" :stages="stages" :cta="cta" />
      <LandingInterlude />
      <LandingProgram v-if="show('program')" :program="content.program" />
      <LandingPeople v-if="show('people')" :people="content.people" />
      <LandingHistory v-if="show('history')" :history="content.history" />
      <LandingVenue v-if="show('venue')" :venue="content.venue" />
      <LandingFaq v-if="show('faq')" :faq="content.faq" />
      <LandingFinale :cta="cta" :stages="stages" :telegram="content.contacts.telegram" :closes-at="closesAt" />
    </main>
    <LandingFooter :contacts="content.contacts" :year="year" />
    <LandingScrollbar />
  </div>
</template>
