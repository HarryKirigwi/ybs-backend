// Request logging middleware
export const requestLogger = (req, res, next) => {
    const start = Date.now();
    
    // Don't log sensitive data in production
    const shouldLogBody = process.env.NODE_ENV === 'development' && 
                         !req.url.includes('auth') && 
                         !req.url.includes('password');
  
    console.log(`📝 ${req.method} ${req.url} - ${req.ip}`);
    
    if (shouldLogBody && Object.keys(req.body).length > 0) {
      console.log('📦 Body:', JSON.stringify(req.body, null, 2));
    }
  
    // Log response when it finishes
    res.on('finish', () => {
      const duration = Date.now() - start;
      const statusEmoji = res.statusCode < 400 ? '✅' : res.statusCode < 500 ? '⚠️' : '❌';
      
      console.log(
        `${statusEmoji} ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`
      );
    });
  
    next();
  };