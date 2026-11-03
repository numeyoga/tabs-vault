export class OrganizerPage {
  constructor(page) { this.page = page; this.panel = page.getByRole('dialog', { name: 'Tags et groupes', exact: true }); }
  async open(library, title, kind = 'tag') { await library.link(title).getByRole('button', { name: kind === 'tag' ? `Organiser ${title}` : `Organiser les groupes de ${title}`, exact: true }).click(); }
  async search(text) { await this.panel.getByRole('searchbox').fill(text); }
  option(kind, name) { return this.panel.getByRole('region', { name: kind === 'tag' ? 'Tags' : 'Groupes', exact: true }).getByRole('checkbox', { name, exact: true }); }
  async toggle(kind, name) {
    const option = this.option(kind, name);
    const before = await option.getAttribute('aria-checked'); await option.click();
    await this.panel.locator(`[role=checkbox][aria-checked="${before === 'true' ? 'false' : 'true'}"]`).filter({ hasText: name }).waitFor();
  }
  async create(kind, name) {
    await this.search(name);
    await this.panel.getByRole('button', { name: `Créer ${kind === 'tag' ? 'le tag' : 'le groupe'} « ${name} »`, exact: true }).click();
    await this.option(kind, name).waitFor();
  }
  async close() { await this.panel.press('Escape'); await this.panel.waitFor({ state: 'hidden' }); }
}
