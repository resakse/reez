from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from pesakit.models import Pesakit

# Get the custom user model
Staff = get_user_model()

class TokenObtainPairTest(APITestCase):
    def setUp(self):
        """
        Set up the test environment for token tests.
        """
        self.username = 'testuser'
        self.password = 'testpassword123'
        self.user = Staff.objects.create_user(username=self.username, password=self.password)
        self.token_url = reverse('token_obtain_pair')

    def test_token_obtain_success(self):
        """
        Ensure we can obtain a token with valid credentials.
        """
        data = {'username': self.username, 'password': self.password}
        response = self.client.post(self.token_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue('access' in response.data)
        self.assertTrue('refresh' in response.data)

    def test_token_obtain_fail_wrong_password(self):
        """
        Ensure we cannot obtain a token with a wrong password.
        """
        data = {'username': self.username, 'password': 'wrongpassword'}
        response = self.client.post(self.token_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_token_obtain_fail_wrong_username(self):
        """
        Ensure we cannot obtain a token with a wrong username.
        """
        data = {'username': 'wronguser', 'password': self.password}
        response = self.client.post(self.token_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class PatientAPITest(APITestCase):
    def setUp(self):
        """
        Set up the test environment for patient API tests.
        """
        self.username = 'apiuser'
        self.password = 'apipassword123'
        self.user = Staff.objects.create_user(username=self.username, password=self.password)
        
        # Create a sample patient for testing
        Pesakit.objects.create(nama='Test Patient', jxr=self.user)
        
        self.patients_url = '/api/patients/' # Using direct path as it's registered by a router

    def test_get_patients_unauthenticated(self):
        """
        Ensure unauthenticated users cannot access the patient list.
        """
        response = self.client.get(self.patients_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_patients_authenticated(self):
        """
        Ensure authenticated users can access the patient list.
        """
        # First, get a token
        token_url = reverse('token_obtain_pair')
        token_response = self.client.post(token_url, {'username': self.username, 'password': self.password}, format='json')
        self.assertEqual(token_response.status_code, status.HTTP_200_OK)
        access_token = token_response.data['access']
        
        # Now, use the token to access the patients API
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        response = self.client.get(self.patients_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Check that our test patient is in the response
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['nama'], 'Test Patient')

    def test_api_does_not_redirect(self):
        """
        Ensure the API endpoint does not issue a redirect, which causes loops with the proxy.
        This test reflects the true web behavior.
        """
        # First, get a token
        token_url = reverse('token_obtain_pair')
        token_response = self.client.post(token_url, {'username': self.username, 'password': self.password}, format='json')
        self.assertEqual(token_response.status_code, status.HTTP_200_OK)
        access_token = token_response.data['access']
        
        # Now, use the token to access the patients API, and crucially, do NOT follow redirects.
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        response = self.client.get(self.patients_url, follow=False)
        
        # Assert that the status code is 200 OK, and NOT a redirect code (301, 302, 307, 308, etc.)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
