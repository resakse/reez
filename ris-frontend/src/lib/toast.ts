interface ToastOptions {
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export class ToastService {
  private static instance: ToastService;
  private container: HTMLElement | null = null;

  public static getInstance(): ToastService {
    if (!ToastService.instance) {
      ToastService.instance = new ToastService();
    }
    return ToastService.instance;
  }

  private getContainer(): HTMLElement {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'fixed top-4 right-4 z-50 space-y-2';
      this.container.id = 'toast-container';
      document.body.appendChild(this.container);
    }
    return this.container;
  }

  public show(options: ToastOptions) {
    const { 
      message, 
      type = 'info', 
      duration = 3000,
      position = 'top-right' 
    } = options;

    const toast = document.createElement('div');
    
    // Base styles
    const baseClasses = 'max-w-md w-96 bg-white shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden';
    
    // Type-specific styles
    let typeClasses = '';
    let iconClasses = '';
    let icon = '';
    
    switch (type) {
      case 'success':
        typeClasses = 'bg-green-50 border-l-4 border-green-400';
        iconClasses = 'text-green-400';
        icon = '✓';
        break;
      case 'error':
        typeClasses = 'bg-red-50 border-l-4 border-red-400';
        iconClasses = 'text-red-400';
        icon = '✗';
        break;
      case 'warning':
        typeClasses = 'bg-yellow-50 border-l-4 border-yellow-400';
        iconClasses = 'text-yellow-400';
        icon = '⚠';
        break;
      case 'info':
      default:
        typeClasses = 'bg-blue-50 border-l-4 border-blue-400';
        iconClasses = 'text-blue-400';
        icon = 'ℹ';
        break;
    }

    toast.className = `${baseClasses} ${typeClasses}`;
    
    toast.innerHTML = `
      <div class="p-4">
        <div class="flex items-start">
          <div class="flex-shrink-0">
            <span class="text-lg ${iconClasses}">${icon}</span>
          </div>
          <div class="ml-3 w-0 flex-1 pt-0.5">
            <p class="text-sm font-medium text-gray-900">${message}</p>
          </div>
          <div class="ml-4 flex-shrink-0 flex">
            <button class="inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:text-gray-500 transition ease-in-out duration-150" onclick="this.parentElement.parentElement.parentElement.parentElement.remove()">
              <span class="text-xl">×</span>
            </button>
          </div>
        </div>
      </div>
    `;

    const container = this.getContainer();
    container.appendChild(toast);

    // Auto-remove after duration
    const timer = setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, duration);
    
    // Allow early cleanup if needed
    const cleanup = () => clearTimeout(timer);
    (toast as any).cleanup = cleanup;
  }

  public success(message: string, duration?: number) {
    this.show({ message, type: 'success', duration });
  }

  public error(message: string, duration?: number) {
    this.show({ message, type: 'error', duration });
  }

  public warning(message: string, duration?: number) {
    this.show({ message, type: 'warning', duration });
  }

  public info(message: string, duration?: number) {
    this.show({ message, type: 'info', duration });
  }
}

export const toast = ToastService.getInstance();