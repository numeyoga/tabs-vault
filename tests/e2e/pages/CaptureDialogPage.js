export class CaptureDialogPage {
  constructor(page) {
    this.dialog = page.getByRole('dialog');
  }
  async chooseExisting(name) {
    const select = this.dialog.getByRole('combobox', { name: `Destination du groupe ${name}` });
    const option = select.getByRole('option', { name: new RegExp(`^Compléter ${name}`) }).first();
    await select.selectOption(await option.getAttribute('value'));
  }
  async chooseDistinct(name) {
    await this.dialog
      .getByRole('combobox', { name: `Destination du groupe ${name}` })
      .selectOption('new');
  }
  async confirm() {
    await this.dialog.getByRole('button', { name: 'Confirmer', exact: true }).click();
  }
  async cancel() {
    await this.dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
  }
}
