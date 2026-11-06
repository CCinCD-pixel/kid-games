import type { Bank, Save } from './types';

/**
 * Game stations (settings.lesson, 1-13) versus the school book's lessons. The save, the tests and the spaced review all keep
 * the station numbers; the book lesson is a label and the way a parent picks "where the teacher is".
 * Book 1-8 = stations 1-8; book 9 (y w, page 10) = station 8 (y w are already in station 2); book 10-13 = stations 9-12;
 * book 14 = station 13 (its pages are not photographed yet, and eng / ong have no recording).
 */
export const BOOK_OPEN_MAX = 13;
export const BOOK_LAST = 14;
export const stationOfBook = (book: number): number => (book <= 8 ? book : book === 9 ? 8 : book - 1);
export const bookOfStation = (b: Bank, station: number): number => b.lessons.find((l) => l.id === station)?.book?.lesson ?? station;
/** The book lesson to show: the one the parent picked when it still points at the current station. */
export const currentBook = (s: Save, b: Bank): number =>
  s.settings.book !== undefined && stationOfBook(s.settings.book) === s.settings.lesson
    ? s.settings.book
    : bookOfStation(b, s.settings.lesson);
const pagesOf = (pages: number[]) => (pages.length ? `第 ${pages.join('、')} 页` : '');
/** “课本第 13 课 · 第 16 页” for a station. */
export function bookLabel(b: Bank, station: number): string {
  const book = b.lessons.find((l) => l.id === station)?.book;
  if (!book) return `第 ${station} 站`;
  const lessons = book.also ? `${book.lesson}、${book.also}` : `${book.lesson}`;
  return [`课本第 ${lessons} 课`, pagesOf(book.pages)].filter(Boolean).join(' · ');
}
export interface BookOption {
  book: number;
  station: number;
  label: string;
  disabled: boolean;
}
/** The "老师讲到这里" choices: one per book lesson, the last one greyed out. */
export function bookOptions(b: Bank): BookOption[] {
  return Array.from({ length: BOOK_LAST }, (_, i) => i + 1).map((book) => {
    const station = stationOfBook(book);
    const row = b.lessons.find((l) => l.id === station);
    const title = book === 9 ? 'y w yi wu yu' : (row?.title ?? '');
    const disabled = book > BOOK_OPEN_MAX;
    return {
      book,
      station,
      disabled,
      // Short on purpose: a long label widens the select and with it the whole parent page (pages are on the home screen).
      label: disabled ? `课本第 ${book} 课 · 等第 14 课` : `课本第 ${book} 课 · ${title}`,
    };
  });
}
