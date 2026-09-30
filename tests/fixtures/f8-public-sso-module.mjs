export default {
  async registerPublic({ ssoProviders }) {
    ssoProviders.register({
      id: 'global-settings.microsoft',
      label: 'Microsoft 365',
      description: 'Organisation identity provider',
      provider_id: 'Microsoft-365',
      order: 100,
    })
  },
}
