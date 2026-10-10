import { inject, provide, ref, type InjectionKey, type Ref } from 'vue';

const cinemaAudioKey: InjectionKey<Ref<number | null>> = Symbol('cinemaAudio');

export function provideCinemaAudio() {
  provide(cinemaAudioKey, ref<number | null>(null));
}

export function useCinemaAudio() {
  return inject(cinemaAudioKey, () => ref<number | null>(null), true);
}
