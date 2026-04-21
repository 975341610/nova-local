import MiniSearch from 'minisearch';

export interface SearchableNote {
  id: string | number;
  title: string;
  content: string;
  tags: string[];
  type: string;
}

class SearchIndex {
  private static instance: SearchIndex;
  private miniSearch: MiniSearch<SearchableNote>;

  private constructor() {
    this.miniSearch = new MiniSearch({
      fields: ['title', 'content', 'tags'],
      storeFields: ['id', 'title', 'type'],
      tokenize: (string) => {
        // 简单的中文支持：按字符切分，同时保留英文单词
        return string.split(/[\s\p{P}]+/u).flatMap(part => {
          if (/[\u4e00-\u9fa5]/.test(part)) {
            return part.split('');
          }
          return [part];
        }).filter(Boolean);
      },
      processTerm: (term) => term.toLowerCase(),
      searchOptions: {
        prefix: true,
        fuzzy: 0.2,
        combineWith: 'AND',
      },
    });
  }

  public static getInstance(): SearchIndex {
    if (!SearchIndex.instance) {
      SearchIndex.instance = new SearchIndex();
    }
    return SearchIndex.instance;
  }

  public buildIndex(notes: SearchableNote[]) {
    this.miniSearch.removeAll();
    this.miniSearch.addAll(notes);
  }

  public addNote(note: SearchableNote) {
    if (this.miniSearch.has(note.id)) {
      this.miniSearch.replace(note);
    } else {
      this.miniSearch.add(note);
    }
  }

  public updateNote(note: SearchableNote) {
    this.addNote(note);
  }

  public removeNote(id: string | number) {
    if (this.miniSearch.has(id)) {
      this.miniSearch.discard(id);
    }
  }

  public search(query: string) {
    if (!query.trim()) return [];
    return this.miniSearch.search(query);
  }
}

export const searchIndex = SearchIndex.getInstance();
