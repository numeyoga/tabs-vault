export class LibraryPage {
  constructor(page) { this.page = page; }
  async open() { await this.page.goto('/library.html'); await this.page.getByRole('status').filter({ hasText: 'Bibliothèque prête.' }).waitFor(); }
  async addLink(url, title) {
    await this.page.getByRole('button', { name: 'Ajouter un lien de démonstration' }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('URL', { exact: true }).fill(url);
    await dialog.getByLabel('Titre', { exact: true }).fill(title);
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await dialog.waitFor({ state: 'detached' });
  }
  link(title) { return this.page.getByRole('listitem').filter({ has: this.page.getByRole('heading', { name: title, exact: true }) }); }
  async reload() { await this.page.reload(); await this.page.getByRole('status').filter({ hasText: 'Bibliothèque prête.' }).waitFor(); }
  async showGroup(name) { await this.page.getByRole('button', { name, exact: true }).click(); }
  async removeFromGroup(title) { await this.openLinkMenu(title); await this.link(title).getByRole('button', { name: 'Retirer du groupe', exact: true }).click(); }
  async dismissDialog() { await this.page.getByRole('dialog').getByRole('button', { name: 'Annuler', exact: true }).click(); }
  async confirmDialog() { await this.page.getByRole('dialog').getByRole('button', { name: 'Confirmer', exact: true }).click(); }
  async measureSearch(text) {
    return this.page.getByRole('searchbox', { name: 'Rechercher' }).evaluate((input, value) => {
      const start = performance.now(); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); return performance.now() - start;
    }, text);
  }
  async search(text) { await this.page.getByRole('searchbox', { name: 'Rechercher' }).fill(text); }
  async createGroup(name) {
    await this.page.getByRole('button', { name: '+ Nouveau groupe', exact: true }).click();
    const dialog = this.page.getByRole('dialog'); await dialog.getByLabel('Nom', { exact: true }).fill(name);
    await dialog.getByRole('button', { name: 'Enregistrer' }).click(); await dialog.waitFor({ state: 'detached' });
  }
  async editLink(title, { tags, groups = [], newTitle, url } = {}) {
    await this.openLinkMenu(title);
    await this.link(title).getByRole('button', { name: 'Modifier', exact: true }).click();
    const dialog = this.page.getByRole('dialog');
    if (tags) await dialog.getByLabel('Tags (un par ligne)').fill(tags.join('\n'));
    if (newTitle !== undefined) await dialog.getByLabel('Titre', { exact: true }).fill(newTitle);
    if (url !== undefined) await dialog.getByLabel('URL', { exact: true }).fill(url);
    for (const group of groups) await dialog.getByRole('checkbox', { name: group, exact: true }).check();
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  }
  async openLinkMenu(title) { await this.link(title).getByRole('button', { name: `Actions pour ${title}`, exact: true }).click(); }
  async trash(title) { await this.openLinkMenu(title); await this.link(title).getByRole('button', { name: 'Corbeille', exact: true }).click(); }
  async showTrash() { await this.page.getByRole('button', { name: /^Corbeille \(/ }).click(); }
  async showAll() { await this.page.getByRole('button', { name: /^Tous les liens \(/ }).click(); }
  async restore(title) { await this.link(title).getByRole('button', { name: 'Réactiver', exact: true }).click(); }
  async purge({ confirm = true } = {}) {
    await this.page.getByRole('button', { name: 'Vider la corbeille', exact: true }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: confirm ? 'Confirmer' : 'Annuler', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
  }
  async deleteGroup(name) {
    await this.page.getByRole('button', { name: `Actions du groupe ${name}`, exact: true }).click();
    await this.page.getByRole('button', { name: `Supprimer le groupe ${name}`, exact: true }).click();
    await this.page.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click();
  }
  async deleteTag(name) {
    await this.page.getByRole('button', { name: `Actions du tag ${name}`, exact: true }).click();
    await this.page.getByRole('button', { name: `Supprimer le tag ${name}`, exact: true }).click();
    await this.page.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click();
  }
  async importJson(data) {
    await this.page.locator('input[type=file]').setInputFiles({ name: 'vault.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  }
  async exportJson() {
    await this.page.getByRole('button', { name: 'Exporter', exact: true }).click();
    const download = this.page.waitForEvent('download');
    await this.page.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click();
    const file = await download; const stream = await file.createReadStream(); const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString());
  }
}
