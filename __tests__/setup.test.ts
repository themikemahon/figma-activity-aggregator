describe('Project Setup', () => {
  it('should have Jest configured correctly', () => {
    expect(true).toBe(true);
  });

  it('should support TypeScript', () => {
    const greeting: string = 'Hello, TypeScript!';
    expect(typeof greeting).toBe('string');
  });
});
