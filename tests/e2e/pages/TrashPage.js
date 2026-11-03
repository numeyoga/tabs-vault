import { LibraryPage } from './LibraryPage.js';
export class TrashPage extends LibraryPage {
  async open() {
    await super.open();
    await this.showTrash();
  }
}
