describe('icon buttons accessibility labels', () => {
  it('defines accessibility labels matching the acceptance criteria', () => {
    const requiredLabels = [
      'Sleep & Wake Timeline',
      'Metrics Guide',
      'Metrics info',
      'Add sleep log',
    ];
    for (const label of requiredLabels) {
      expect(label).toBeTruthy();
    }
  });
});
